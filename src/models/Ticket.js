import mongoose from 'mongoose';
import { TICKET_STATUSES, DEFAULT_TICKET_STATUS, ESTADOS_ACTIVOS, QUANTITY_MIN, QUANTITY_MAX } from '../config/tickets.config.js';

// Ticket: la inscripción de un usuario a un evento. Es la entidad intermedia de la relación
// muchos-a-muchos y guarda los datos del "acuerdo" (estado, cantidad, código, cancelación).
// Solo referencias: nunca se copia el usuario ni el evento dentro del ticket.
const ticketSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
    status: { type: String, enum: TICKET_STATUSES, default: DEFAULT_TICKET_STATUS },
    quantity: {
      type: Number,
      required: true,
      min: QUANTITY_MIN,
      max: QUANTITY_MAX,
      validate: { validator: Number.isInteger, message: 'quantity debe ser un entero' },
    },
    // Código legible para el inscrito (va en el correo). Lo genera el servidor, nunca el cliente.
    reservationCode: { type: String, required: true, unique: true, uppercase: true, trim: true },
    // Cancelación lógica: el documento se conserva con la fecha en que se canceló
    cancelledAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Cupos ocupados de un evento y listado por evento
ticketSchema.index({ event: 1, status: 1 });
// "Mis tickets", del más reciente al más antiguo
ticketSchema.index({ user: 1, createdAt: -1 });
// Una sola inscripción ACTIVA por usuario y evento, garantizada por la base aunque dos
// peticiones lleguen al mismo tiempo. Las canceladas no entran al índice: el usuario puede
// volver a inscribirse después de cancelar.
ticketSchema.index(
  { user: 1, event: 1 },
  { unique: true, partialFilterExpression: { status: { $in: [...ESTADOS_ACTIVOS] } } }
);

const Ticket = mongoose.model('Ticket', ticketSchema);

export default Ticket;
