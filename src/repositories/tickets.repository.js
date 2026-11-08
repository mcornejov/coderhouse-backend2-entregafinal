import { toTicketDTO } from '../dto/ticket.dto.js';
import { ESTADOS_TICKET, ESTADOS_ACTIVOS } from '../config/tickets.config.js';

// Repositorio de tickets: abstrae el acceso a datos y entrega DTOs hacia el servicio.
export default class TicketsRepository {
  constructor(dao) {
    this.dao = dao;
  }

  async create(ticketData) {
    const ticket = await this.dao.create(ticketData);
    return toTicketDTO(ticket);
  }

  async getById(id) {
    const ticket = await this.dao.getById(id);
    return ticket ? toTicketDTO(ticket) : null;
  }

  async findByUser(userId) {
    const tickets = await this.dao.findByUser(userId);
    return tickets.map(toTicketDTO);
  }

  async findByEvent(eventId, opciones) {
    const tickets = await this.dao.findByEvent(eventId, opciones);
    return tickets.map(toTicketDTO);
  }

  async findActiveByUserAndEvent(userId, eventId) {
    const ticket = await this.dao.findActiveByUserAndEvent(userId, eventId);
    return ticket ? toTicketDTO(ticket) : null;
  }

  /** @returns {Promise<number>} lugares ocupados por tickets activos */
  async contarCuposOcupados(eventId, opciones) {
    return this.dao.sumActiveQuantity(eventId, opciones);
  }

  /**
   * Cancelación lógica: status cancelled y cancelledAt, solo si el ticket sigue activo.
   * Devuelve null si no existe o si otra petición ya lo canceló.
   */
  async cancelar(id, cancelledAt) {
    const ticket = await this.dao.updateById(id, { status: ESTADOS_TICKET.CANCELLED, cancelledAt }, ESTADOS_ACTIVOS);
    return ticket ? toTicketDTO(ticket) : null;
  }

  async removeById(id) {
    return this.dao.removeById(id);
  }
}
