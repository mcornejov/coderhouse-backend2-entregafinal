import mongoose from 'mongoose';
import Ticket from '../models/Ticket.js';
import { ESTADOS_ACTIVOS } from '../config/tickets.config.js';

// DAO de tickets: única capa que conoce Mongoose y el modelo Ticket. Devuelve objetos planos
// (con `populate` cuando la consulta lo pide); la conversión a DTO la hace el repositorio.

// Campos del evento y del usuario que viajan con el ticket. Del usuario nunca sale la contraseña
// ni el rol: el organizador necesita saber quién asiste, no cómo inicia sesión.
const EVENTO_RESUMIDO = 'title date location';
const USUARIO_RESUMIDO = 'first_name last_name email';

export default class TicketsDao {
  async create(ticketData) {
    const ticket = await Ticket.create(ticketData);
    return ticket.toObject();
  }

  async getById(id) {
    return Ticket.findById(id).lean();
  }

  /** Tickets de un usuario, del más reciente al más antiguo, con el resumen del evento. */
  async findByUser(userId) {
    return Ticket.find({ user: userId }).sort({ createdAt: -1 }).populate('event', EVENTO_RESUMIDO).lean();
  }

  /** Tickets de un evento en orden de llegada, con el resumen de cada inscrito. */
  async findByEvent(eventId, { status } = {}) {
    const consulta = { event: eventId };
    if (status) consulta.status = status;
    return Ticket.find(consulta).sort({ createdAt: 1, _id: 1 }).populate('user', USUARIO_RESUMIDO).lean();
  }

  /** Ticket activo (confirmed o pending) de un usuario en un evento, o null. */
  async findActiveByUserAndEvent(userId, eventId) {
    return Ticket.findOne({ user: userId, event: eventId, status: { $in: ESTADOS_ACTIVOS } }).lean();
  }

  /**
   * Lugares ocupados en un evento: suma de `quantity` de los tickets activos. Los cancelados no
   * cuentan, así el cupo se libera solo al cancelar. Con `hastaId` se cuentan únicamente los
   * tickets creados hasta ese id (los ObjectId crecen con el tiempo): sirve para que, si dos
   * inscripciones simultáneas superan la capacidad, solo la más reciente se deshaga.
   * @param {string} eventId
   * @param {{ hastaId?: string }} [opciones]
   * @returns {Promise<number>}
   */
  async sumActiveQuantity(eventId, { hastaId } = {}) {
    const filtro = { event: new mongoose.Types.ObjectId(eventId), status: { $in: ESTADOS_ACTIVOS } };
    if (hastaId) filtro._id = { $lte: new mongoose.Types.ObjectId(hastaId) };
    const [resultado] = await Ticket.aggregate([
      { $match: filtro },
      { $group: { _id: null, total: { $sum: '$quantity' } } },
    ]);
    return resultado?.total ?? 0;
  }

  /**
   * Actualiza un ticket solo si sigue en uno de los estados indicados (misma operación atómica):
   * dos cancelaciones simultáneas no se pisan. runValidators: los cambios pasan por el esquema.
   */
  async updateById(id, cambios, estadosPermitidos) {
    const condicion = { _id: id };
    if (estadosPermitidos) condicion.status = { $in: estadosPermitidos };
    return Ticket.findOneAndUpdate(condicion, cambios, { returnDocument: 'after', runValidators: true }).lean();
  }

  /**
   * Único borrado físico del proyecto: deshace una reserva que nunca llegó al cliente, cuando
   * dos inscripciones simultáneas superaron la capacidad y esta fue la más reciente. Un ticket
   * que sí se entregó jamás se borra: se cancela.
   */
  async removeById(id) {
    await Ticket.deleteOne({ _id: id });
  }
}
