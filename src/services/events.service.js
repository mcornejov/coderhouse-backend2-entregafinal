import { esAdmin } from '../config/roles.config.js';
import {
  ESTADOS_EVENTO,
  EVENT_STATUSES,
  ESTADOS_FINALES,
  LONGITUD_MAXIMA,
  esEstadoValido,
  puedeTransicionar,
  CAMPOS_ORDENABLES,
  ORDEN_POR_DEFECTO,
  PAGINACION,
} from '../config/events.config.js';
import { BadRequestError, NotFoundError, ForbiddenError, ConflictError } from '../utils/errors.util.js';
import { isNonEmptyString, isIsoDateString, isDateOnlyString, toUtcIsoString } from '../utils/validators.js';

// Campos que el cliente puede enviar al crear o modificar un evento. `organizer` y
// `status` no están: el organizador sale de la sesión y el estado cambia solo por
// PATCH /:eid/status, donde se aplican las transiciones permitidas.
const CAMPOS_EVENTO = ['title', 'description', 'category', 'date', 'location', 'capacity', 'price'];
const CAMPOS_OBLIGATORIOS = ['title', 'description', 'category', 'date', 'location', 'capacity'];

// Parámetros de consulta reconocidos por el listado
const FILTROS = ['status', 'category', 'location', 'dateFrom', 'dateTo'];
const PARAMETROS_LISTADO = [...FILTROS, 'page', 'limit', 'sort'];

const MENSAJE_ESTADO_FINAL = Object.freeze({
  [ESTADOS_EVENTO.CANCELLED]: 'El evento está cancelado y no admite modificaciones',
  [ESTADOS_EVENTO.FINISHED]: 'El evento ya finalizó y no admite modificaciones',
});

// Capa de negocio de eventos. No conoce HTTP ni Mongoose: recibe datos planos y el
// usuario de la sesión, aplica las reglas y lanza errores con código HTTP asociado:
// 400 datos inválidos · 403 sin permiso sobre este evento · 404 no existe ·
// 409 la acción es incoherente con el estado actual del evento.
export default class EventsService {
  /**
   * @param {object} repository
   * @param {{ ahora?: () => Date }} [opciones] reloj inyectable para probar las reglas temporales
   */
  constructor(repository, { ahora = () => new Date() } = {}) {
    this.repository = repository;
    this.ahora = ahora;
  }

  /**
   * Listado público con filtros, paginación y orden. Los parámetros llegan como texto
   * desde la query string; aquí se validan y normalizan antes de tocar el repositorio.
   * @param {Record<string, unknown>} query req.query
   * @returns {Promise<{ data: object[], page: number, limit: number, total: number, totalPages: number }>}
   */
  async listar(query = {}) {
    const parametros = this.#parametrosDeTexto(query);
    const filtro = this.#parsearFiltros(parametros);
    const paginacion = this.#parsearPaginacion(parametros);

    const { data, total } = await this.repository.buscar(filtro, paginacion);
    return {
      data,
      page: paginacion.page,
      limit: paginacion.limit,
      total,
      totalPages: Math.ceil(total / paginacion.limit),
    };
  }

  async obtenerPorId(id) {
    const evento = await this.repository.getById(id);
    if (!evento) {
      throw new NotFoundError(`No existe un evento con id ${id}`);
    }
    return evento;
  }

  /**
   * Crea un evento a nombre del usuario autenticado. El rol ya fue autorizado por el
   * middleware; aquí solo se valida el contenido y se fija el organizador desde la sesión.
   * @param {object} datos body de la petición
   * @param {{ id: string, role: string }} usuario req.user
   */
  async crear(datos, usuario) {
    const evento = this.#filtrarCampos(datos);

    const faltantes = CAMPOS_OBLIGATORIOS.filter((campo) => evento[campo] === undefined || evento[campo] === '');
    if (faltantes.length > 0) {
      throw new BadRequestError(`Faltan campos obligatorios: ${faltantes.join(', ')}`);
    }
    this.#validarValores(evento);

    // El organizador nunca viene del body: es quien está autenticado.
    // El estado tampoco: todo evento nace en draft (default del esquema).
    return this.repository.create({ ...evento, organizer: usuario.id });
  }

  /**
   * Modifica los datos de un evento. Reglas: solo el organizer dueño o un admin; un evento
   * cancelado o finalizado ya no se modifica; los valores nuevos cumplen las mismas reglas
   * que al crear (incluida la fecha futura). El estado no se cambia por aquí.
   * @param {string} id
   * @param {object} datos body de la petición
   * @param {{ id: string, role: string }} usuario req.user
   */
  async actualizar(id, datos, usuario) {
    const evento = await this.obtenerPorId(id);
    this.#verificarPropiedad(evento, usuario);
    this.#verificarModificable(evento);

    const cambios = this.#filtrarCampos(datos);
    if (Object.keys(cambios).length === 0) {
      throw new BadRequestError('No se enviaron campos modificables');
    }
    this.#validarValores(cambios);

    // La escritura exige que el evento siga en un estado modificable: si otra petición lo
    // canceló entre la lectura y la escritura, no se pisa.
    const actualizado = await this.repository.actualizarSiModificable(id, cambios);
    return actualizado ?? this.#resolverEscrituraFallida(id);
  }

  /**
   * Cambia el estado del evento siguiendo la tabla de transiciones. Cancelar es una
   * transición más: el evento queda con status cancelled, nunca se borra de la base.
   * @param {string} id
   * @param {object} datos body: { status }
   * @param {{ id: string, role: string }} usuario req.user
   */
  async cambiarEstado(id, datos, usuario) {
    const nuevoEstado = datos && typeof datos === 'object' ? datos.status : undefined;
    if (nuevoEstado === undefined) {
      throw new BadRequestError('Falta el campo obligatorio: status');
    }
    if (!esEstadoValido(nuevoEstado)) {
      throw new BadRequestError(`El campo status debe ser uno de: ${EVENT_STATUSES.join(', ')}`);
    }

    const evento = await this.obtenerPorId(id);
    this.#verificarPropiedad(evento, usuario);
    this.#verificarModificable(evento);

    if (evento.status === nuevoEstado) {
      throw new ConflictError(`El evento ya está en estado ${nuevoEstado}`);
    }
    if (!puedeTransicionar(evento.status, nuevoEstado)) {
      throw new ConflictError(`No se puede pasar un evento de ${evento.status} a ${nuevoEstado}`);
    }
    // Publicar algo que ya ocurrió no tiene sentido: nadie podría inscribirse
    if (nuevoEstado === ESTADOS_EVENTO.PUBLISHED && this.#esPasada(evento.date)) {
      throw new ConflictError('No se puede publicar un evento cuya fecha ya pasó');
    }

    // Solo se escribe si el evento sigue en el estado desde el que se validó la transición
    const actualizado = await this.repository.cambiarEstado(id, evento.status, nuevoEstado);
    return actualizado ?? this.#resolverEscrituraFallida(id);
  }

  // --- Permisos y estado ---

  // Regla de propiedad: un organizer solo toca los eventos que creó; un admin, cualquiera.
  // Vive aquí (y no en el middleware) porque hace falta el evento cargado para saber de quién es.
  #verificarPropiedad(evento, usuario) {
    if (!esAdmin(usuario.role) && evento.organizer !== usuario.id) {
      throw new ForbiddenError('Solo puedes modificar tus propios eventos');
    }
  }

  // Los estados finales congelan el evento: ni datos ni estado se cambian
  #verificarModificable(evento) {
    if (ESTADOS_FINALES.includes(evento.status)) {
      throw new ConflictError(MENSAJE_ESTADO_FINAL[evento.status]);
    }
  }

  // La escritura condicional no encontró el evento en el estado esperado: o desapareció
  // (404) o alguien lo cambió de estado entre la lectura y la escritura (409).
  async #resolverEscrituraFallida(id) {
    const actual = await this.repository.getById(id);
    if (!actual) {
      throw new NotFoundError(`No existe un evento con id ${id}`);
    }
    throw new ConflictError(`El evento cambió a estado ${actual.status} mientras se procesaba la petición`);
  }

  #esPasada(fecha) {
    return new Date(fecha).getTime() <= this.ahora().getTime();
  }

  // --- Contenido del evento ---

  // Whitelist: ignora cualquier campo fuera de CAMPOS_EVENTO (organizer, status, _id...)
  #filtrarCampos(datos) {
    const origen = datos && typeof datos === 'object' ? datos : {};
    const resultado = {};
    for (const campo of CAMPOS_EVENTO) {
      if (origen[campo] !== undefined) {
        resultado[campo] = origen[campo];
      }
    }
    return resultado;
  }

  // Reglas de contenido. La fecha debe llegar como texto ISO 8601 (ver isIsoDateString): un
  // número o un booleano también "son" una fecha para new Date() y guardarían 1970 sin aviso,
  // y "2027-02-30" se convertiría en el 2 de marzo. Además debe ser futura.
  #validarValores(evento) {
    for (const campo of ['title', 'description', 'category', 'location']) {
      if (evento[campo] === undefined) continue;
      if (!isNonEmptyString(evento[campo])) {
        throw new BadRequestError(`El campo ${campo} debe ser un texto no vacío`);
      }
      if (evento[campo].length > LONGITUD_MAXIMA[campo]) {
        throw new BadRequestError(`El campo ${campo} no puede superar los ${LONGITUD_MAXIMA[campo]} caracteres`);
      }
    }
    if (evento.category !== undefined) {
      evento.category = evento.category.trim().toLowerCase();
    }
    if (evento.date !== undefined) {
      if (!isIsoDateString(evento.date)) {
        throw new BadRequestError('El campo date debe ser una fecha válida en formato ISO 8601');
      }
      // Se guarda normalizada en UTC: una hora sin zona no depende del reloj del servidor
      evento.date = toUtcIsoString(evento.date);
      if (this.#esPasada(evento.date)) {
        throw new BadRequestError('La fecha del evento no puede ser pasada');
      }
    }
    if (evento.capacity !== undefined && !(Number.isInteger(evento.capacity) && evento.capacity > 0)) {
      throw new BadRequestError('El campo capacity debe ser un entero mayor que 0');
    }
    if (evento.price !== undefined && !(typeof evento.price === 'number' && Number.isFinite(evento.price) && evento.price >= 0)) {
      throw new BadRequestError('El campo price debe ser un número mayor o igual a 0');
    }
  }

  // --- Listado ---

  // Un parámetro repetido (?status=a&status=b) llega como arreglo; se exige texto simple
  #parametrosDeTexto(query) {
    const resultado = {};
    for (const nombre of PARAMETROS_LISTADO) {
      const valor = query[nombre];
      if (valor === undefined) continue;
      if (typeof valor !== 'string') {
        throw new BadRequestError(`El parámetro ${nombre} debe indicarse una sola vez como texto`);
      }
      const limpio = valor.trim();
      if (limpio !== '') resultado[nombre] = limpio;
    }
    return resultado;
  }

  #parsearFiltros(parametros) {
    const filtro = {};
    if (parametros.status !== undefined) {
      if (!esEstadoValido(parametros.status)) {
        throw new BadRequestError(`El filtro status debe ser uno de: ${EVENT_STATUSES.join(', ')}`);
      }
      filtro.status = parametros.status;
    }
    if (parametros.category !== undefined) filtro.category = parametros.category.toLowerCase();
    if (parametros.location !== undefined) filtro.location = parametros.location;

    for (const nombre of ['dateFrom', 'dateTo']) {
      if (parametros[nombre] !== undefined && !isIsoDateString(parametros[nombre])) {
        throw new BadRequestError(`El filtro ${nombre} debe ser una fecha válida en formato ISO 8601`);
      }
    }
    if (parametros.dateFrom !== undefined) filtro.dateFrom = new Date(toUtcIsoString(parametros.dateFrom));
    if (parametros.dateTo !== undefined) {
      // "2027-03-15" sin hora se entiende como el día completo, no como su medianoche
      const hasta = new Date(toUtcIsoString(parametros.dateTo));
      filtro.dateTo = isDateOnlyString(parametros.dateTo) ? new Date(hasta.getTime() + 86_400_000 - 1) : hasta;
    }
    if (filtro.dateFrom && filtro.dateTo && filtro.dateFrom > filtro.dateTo) {
      throw new BadRequestError('El filtro dateFrom no puede ser posterior a dateTo');
    }
    return filtro;
  }

  #parsearPaginacion(parametros) {
    const page = this.#enteroPositivo(parametros.page, PAGINACION.PAGINA_POR_DEFECTO);
    if (page === null) {
      throw new BadRequestError('El parámetro page debe ser un entero mayor que 0');
    }
    const limit = this.#enteroPositivo(parametros.limit, PAGINACION.LIMITE_POR_DEFECTO);
    if (limit === null || limit > PAGINACION.LIMITE_MAXIMO) {
      throw new BadRequestError(`El parámetro limit debe ser un entero entre 1 y ${PAGINACION.LIMITE_MAXIMO}`);
    }

    // sort=date (ascendente) o sort=-date (descendente), solo sobre campos conocidos
    const sort = parametros.sort ?? ORDEN_POR_DEFECTO;
    const descendente = sort.startsWith('-');
    const campo = descendente ? sort.slice(1) : sort;
    if (!CAMPOS_ORDENABLES.includes(campo)) {
      throw new BadRequestError(`El parámetro sort debe ser uno de: ${CAMPOS_ORDENABLES.join(', ')} (con "-" delante para orden descendente)`);
    }

    return { page, limit, orden: { [campo]: descendente ? -1 : 1 } };
  }

  // Devuelve el entero (o el default si no vino), o null si el texto no es un entero > 0
  #enteroPositivo(texto, porDefecto) {
    if (texto === undefined) return porDefecto;
    if (!/^\d+$/.test(texto)) return null;
    const numero = Number(texto);
    return Number.isSafeInteger(numero) && numero > 0 ? numero : null;
  }
}
