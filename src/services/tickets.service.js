import { esAdmin } from '../config/roles.config.js';
import { ESTADOS_EVENTO } from '../config/events.config.js';
import { ESTADOS_TICKET, QUANTITY_MIN, QUANTITY_MAX, esEstadoTicketValido, TICKET_STATUSES } from '../config/tickets.config.js';
import { BadRequestError, NotFoundError, ForbiddenError, ConflictError } from '../utils/errors.util.js';
import { generarCodigoReserva } from '../utils/reservationCode.util.js';

// Intentos de generar un código de reserva no repetido (la colisión es improbable: 32^8)
const INTENTOS_CODIGO = 3;

// Capa de negocio de las inscripciones. No conoce HTTP ni Mongoose. Códigos que lanza:
// 400 datos inválidos · 403 el ticket/evento no es tuyo · 404 no existe ·
// 409 la acción es incoherente con el estado (evento no publicado, sin cupo, duplicado, ya cancelado).
export default class TicketsService {
  /**
   * @param {object} ticketsRepository
   * @param {object} eventsRepository   para cargar el evento al que se inscribe
   * @param {object} usersRepository    para avisar al dueño del ticket cuando lo cancela un admin
   * @param {object} mailService        notificaciones (confirmación y cancelación)
   * @param {{ ahora?: () => Date }} [opciones] reloj inyectable para las reglas temporales
   */
  constructor(ticketsRepository, eventsRepository, usersRepository, mailService, { ahora = () => new Date() } = {}) {
    this.tickets = ticketsRepository;
    this.events = eventsRepository;
    this.users = usersRepository;
    this.mail = mailService;
    this.ahora = ahora;
  }

  /**
   * Inscribe al usuario autenticado en un evento. Orden de las reglas: cantidad válida (400) →
   * el evento existe (404) → está publicado y vigente (409) → sin inscripción activa previa (409)
   * → cupo suficiente (409). Recién entonces se crea el ticket y se envía el correo.
   * @param {string} eventId
   * @param {object} datos body: { quantity? } (por defecto 1)
   * @param {{ id: string, email: string, role: string }} usuario req.user
   */
  async inscribir(eventId, datos, usuario) {
    const quantity = this.#parsearCantidad(datos);
    const evento = await this.#obtenerEvento(eventId);
    this.#verificarEventoDisponible(evento);

    const activo = await this.tickets.findActiveByUserAndEvent(usuario.id, evento.id);
    if (activo) {
      throw new ConflictError(`Ya tienes una inscripción activa para este evento (código ${activo.reservationCode})`);
    }

    const ocupados = await this.tickets.contarCuposOcupados(evento.id);
    this.#verificarCupo(evento, ocupados, quantity);

    const ticket = await this.#crearConCodigoUnico({ user: usuario.id, event: evento.id, quantity });

    // Dos inscripciones simultáneas pudieron pasar la verificación de cupo con el mismo conteo.
    // Se recuenta incluyendo solo los tickets creados hasta este; si con él se supera la capacidad,
    // este es el que sobra: se deshace la reserva (nunca llegó al cliente) y se informa el conflicto.
    const ocupadosHastaEste = await this.tickets.contarCuposOcupados(evento.id, { hastaId: ticket.id });
    if (ocupadosHastaEste > evento.capacity) {
      await this.tickets.removeById(ticket.id);
      this.#verificarCupo(evento, ocupadosHastaEste - quantity, quantity);
    }

    // El correo va después de persistir y no bloquea la respuesta: si el SMTP falla, la
    // inscripción sigue siendo válida y el fallo queda registrado en el servidor.
    this.mail.enviarConfirmacionInscripcion({ destinatario: usuario.email, ticket, evento });

    return ticket;
  }

  /** Tickets del usuario autenticado con el resumen del evento (title, date, location). */
  async misTickets(usuario) {
    return this.tickets.findByUser(usuario.id);
  }

  /**
   * Inscritos de un evento, con cupos ocupados y disponibles. Solo el organizer dueño o un admin.
   * @param {string} eventId
   * @param {{ id: string, role: string }} usuario
   * @param {{ status?: unknown }} [query] filtro opcional por estado del ticket
   */
  async ticketsDeEvento(eventId, usuario, query = {}) {
    const evento = await this.#obtenerEvento(eventId);
    if (!esAdmin(usuario.role) && evento.organizer !== usuario.id) {
      throw new ForbiddenError('Solo puedes ver las inscripciones de tus propios eventos');
    }

    if (query.status !== undefined && typeof query.status !== 'string') {
      throw new BadRequestError('El parámetro status debe indicarse una sola vez como texto');
    }
    const status = query.status?.trim() ? query.status.trim() : undefined;
    if (status !== undefined && !esEstadoTicketValido(status)) {
      throw new BadRequestError(`El filtro status debe ser uno de: ${TICKET_STATUSES.join(', ')}`);
    }

    const [tickets, ocupados] = await Promise.all([
      this.tickets.findByEvent(evento.id, { status }),
      this.tickets.contarCuposOcupados(evento.id),
    ]);
    return {
      event: { id: evento.id, title: evento.title, date: evento.date, status: evento.status, capacity: evento.capacity },
      cuposOcupados: ocupados,
      cuposDisponibles: Math.max(evento.capacity - ocupados, 0),
      tickets,
    };
  }

  /**
   * Cancelación lógica: status cancelled + cancelledAt. El documento se conserva y, al no contar
   * en el cálculo, el cupo queda libre de inmediato. Solo el dueño del ticket o un admin.
   * @param {string} ticketId
   * @param {{ id: string, role: string }} usuario
   */
  async cancelar(ticketId, usuario) {
    const ticket = await this.tickets.getById(ticketId);
    if (!ticket) {
      throw new NotFoundError(`No existe un ticket con id ${ticketId}`);
    }
    if (!esAdmin(usuario.role) && ticket.user !== usuario.id) {
      throw new ForbiddenError('Solo puedes cancelar tus propios tickets');
    }
    if (ticket.status === ESTADOS_TICKET.CANCELLED) {
      throw new ConflictError('El ticket ya está cancelado');
    }

    // Solo se escribe si el ticket sigue activo: dos cancelaciones simultáneas no se pisan
    const cancelado = await this.tickets.cancelar(ticketId, this.ahora());
    if (!cancelado) {
      const actual = await this.tickets.getById(ticketId);
      if (!actual) throw new NotFoundError(`No existe un ticket con id ${ticketId}`);
      throw new ConflictError('El ticket ya está cancelado');
    }

    // Aviso al dueño del ticket (aunque lo haya cancelado un admin), sin bloquear la respuesta
    this.#notificarCancelacion(cancelado, usuario);
    return cancelado;
  }

  // Resuelve destinatario y evento y envía el correo de cancelación. Cualquier fallo queda
  // dentro: la cancelación ya está persistida y no depende de la notificación.
  async #notificarCancelacion(ticket, solicitante) {
    try {
      const esDuenio = ticket.user === solicitante.id;
      const destinatario = esDuenio ? solicitante.email : (await this.users.findById(ticket.user))?.email;
      const evento = await this.events.getById(ticket.event);
      if (destinatario && evento) {
        await this.mail.enviarCancelacionInscripcion({ destinatario, ticket, evento });
      }
    } catch {
      // El correo es secundario: la cancelación ya se respondió al cliente
    }
  }

  // --- Reglas ---

  #parsearCantidad(datos) {
    const quantity = datos && typeof datos === 'object' ? datos.quantity : undefined;
    if (quantity === undefined) return QUANTITY_MIN;
    if (!(Number.isInteger(quantity) && quantity >= QUANTITY_MIN && quantity <= QUANTITY_MAX)) {
      throw new BadRequestError(`El campo quantity debe ser un entero entre ${QUANTITY_MIN} y ${QUANTITY_MAX}`);
    }
    return quantity;
  }

  async #obtenerEvento(eventId) {
    const evento = await this.events.getById(eventId);
    if (!evento) {
      throw new NotFoundError(`No existe un evento con id ${eventId}`);
    }
    return evento;
  }

  // Solo se inscribe a un evento publicado que todavía no ocurrió
  #verificarEventoDisponible(evento) {
    const mensajes = {
      [ESTADOS_EVENTO.DRAFT]: 'El evento todavía no está publicado',
      [ESTADOS_EVENTO.CANCELLED]: 'El evento está cancelado',
      [ESTADOS_EVENTO.FINISHED]: 'El evento ya finalizó',
    };
    if (evento.status !== ESTADOS_EVENTO.PUBLISHED) {
      throw new ConflictError(mensajes[evento.status] ?? 'El evento no admite inscripciones');
    }
    if (new Date(evento.date).getTime() <= this.ahora().getTime()) {
      throw new ConflictError('El evento ya ocurrió');
    }
  }

  // Cupo = capacidad del evento menos lugares de tickets activos (los cancelados no cuentan)
  #verificarCupo(evento, ocupados, quantity) {
    const disponibles = Math.max(evento.capacity - ocupados, 0);
    if (disponibles === 0) {
      throw new ConflictError('El evento no tiene cupos disponibles');
    }
    if (disponibles < quantity) {
      throw new ConflictError(`No hay cupo suficiente: quedan ${disponibles} lugares y solicitaste ${quantity}`);
    }
  }

  // El índice único (user, event) activo puede rechazar una inscripción duplicada simultánea;
  // una colisión de código de reserva se reintenta con otro código.
  async #crearConCodigoUnico(datos) {
    for (let intento = 1; ; intento++) {
      try {
        return await this.tickets.create({ ...datos, reservationCode: generarCodigoReserva() });
      } catch (error) {
        const campos = Object.keys(error?.keyPattern ?? {});
        if (error?.code === 11000 && campos.includes('user') && campos.includes('event')) {
          throw new ConflictError('Ya tienes una inscripción activa para este evento');
        }
        if (error?.code === 11000 && campos.includes('reservationCode') && intento < INTENTOS_CODIGO) {
          continue;
        }
        throw error;
      }
    }
  }
}
