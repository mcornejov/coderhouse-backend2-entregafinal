import mongoose from 'mongoose';
import { EVENT_STATUSES, DEFAULT_STATUS, LONGITUD_MAXIMA } from '../config/events.config.js';

// Modelo de evento de la Plataforma de Eventos e Inscripciones de Café Aurora
// (catas, talleres de barismo, charlas, música en vivo). Las reglas de negocio
// (fecha futura, estados, propiedad) viven en el servicio; el esquema es la segunda
// barrera: tipos, obligatoriedad y rangos que ningún camino de escritura puede saltar.
const eventSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: LONGITUD_MAXIMA.title },
    description: { type: String, required: true, trim: true, maxlength: LONGITUD_MAXIMA.description },
    // Categoría como texto normalizado (cata, taller, charla, musica...). Se filtra por
    // igualdad exacta, así que se guarda en minúsculas y sin espacios en los extremos.
    category: { type: String, required: true, trim: true, lowercase: true, maxlength: LONGITUD_MAXIMA.category },
    date: { type: Date, required: true },
    location: { type: String, required: true, trim: true, maxlength: LONGITUD_MAXIMA.location },
    capacity: { type: Number, required: true, min: 1 },
    price: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: EVENT_STATUSES, default: DEFAULT_STATUS },
    // Referencia al usuario que creó el evento, nunca el usuario embebido. La fija el
    // servicio desde la sesión; el body no puede imponerla.
    organizer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

// Índices para los filtros y el orden del listado público
eventSchema.index({ date: 1 });
eventSchema.index({ status: 1, date: 1 });
eventSchema.index({ category: 1 });
eventSchema.index({ organizer: 1 });

const Event = mongoose.model('Event', eventSchema);

export default Event;
