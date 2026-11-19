import { toEventDTO } from '../dto/event.dto.js';
import { ESTADOS_EVENTO, ESTADOS_MODIFICABLES } from '../config/events.config.js';

// Repositorio de eventos: abstrae el acceso a datos y entrega DTOs hacia el servicio,
// de modo que ninguna capa superior manipule documentos ni ObjectId de Mongoose.
export default class EventsRepository {
  constructor(dao) {
    this.dao = dao;
  }

  async create(eventData) {
    const evento = await this.dao.create(eventData);
    return toEventDTO(evento);
  }

  /**
   * @param {object} filtro criterios ya validados por el servicio
   * @param {{ orden: Record<string, 1|-1>, page: number, limit: number }} paginacion
   * @returns {Promise<{ data: object[], total: number }>}
   */
  async buscar(filtro, { orden, page, limit }) {
    const { docs, total } = await this.dao.buscar(filtro, { orden, skip: (page - 1) * limit, limit });
    return { data: docs.map(toEventDTO), total };
  }

  async getById(id) {
    const evento = await this.dao.getById(id);
    return evento ? toEventDTO(evento) : null;
  }

  /**
   * Modifica los datos de un evento solo si sigue en un estado modificable (ni cancelado ni
   * finalizado). Devuelve null si no existe o si otra petición ya lo llevó a un estado final.
   */
  async actualizarSiModificable(id, cambios) {
    const evento = await this.dao.updateById(id, cambios, ESTADOS_MODIFICABLES);
    return evento ? toEventDTO(evento) : null;
  }

  /**
   * Transición de estado condicionada al estado desde el que se validó: si el evento ya no está
   * en `estadoActual`, no se escribe y devuelve null.
   */
  async cambiarEstado(id, estadoActual, nuevoEstado) {
    const evento = await this.dao.updateById(id, { status: nuevoEstado }, [estadoActual]);
    return evento ? toEventDTO(evento) : null;
  }

  /**
   * Reserva `cantidad` lugares solo si el evento sigue publicado y caben en su capacidad
   * (operación atómica en la base). Devuelve false si no se pudo reservar.
   * @returns {Promise<boolean>}
   */
  async reservarCupos(id, cantidad) {
    return this.dao.reserveSeats(id, cantidad, ESTADOS_EVENTO.PUBLISHED);
  }

  /** Libera lugares reservados: al cancelar un ticket o si la inscripción no llegó a crearse. */
  async liberarCupos(id, cantidad) {
    await this.dao.releaseSeats(id, cantidad);
  }

  /** Deja el contador de lugares reservados en el valor indicado (tarea de mantenimiento). */
  async fijarCuposReservados(id, cantidad) {
    await this.dao.setSeatsTaken(id, cantidad);
  }
}
