import Event from '../models/Event.js';

// DAO de eventos: única capa que conoce Mongoose y el modelo Event. Recibe criterios
// neutros desde el repositorio y aquí los traduce a la sintaxis de consulta de MongoDB
// ($in, $gte, $regex), de modo que las capas superiores no dependan del motor.
// Devuelve objetos planos; la conversión a DTO la hace el repositorio.

// Para buscar "providencia" dentro de "Café Aurora, Providencia" sin que los caracteres
// especiales del texto del usuario se interpreten como expresión regular.
function escaparRegex(texto) {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * @param {{ status?: string, category?: string, location?: string, dateFrom?: Date, dateTo?: Date }} filtro
 */
function construirConsulta(filtro) {
  const consulta = {};
  if (filtro.status) consulta.status = filtro.status;
  if (filtro.category) consulta.category = filtro.category;
  if (filtro.location) consulta.location = { $regex: escaparRegex(filtro.location), $options: 'i' };
  if (filtro.dateFrom || filtro.dateTo) {
    consulta.date = {};
    if (filtro.dateFrom) consulta.date.$gte = filtro.dateFrom;
    if (filtro.dateTo) consulta.date.$lte = filtro.dateTo;
  }
  return consulta;
}

export default class EventsDao {
  async create(eventData) {
    const evento = await Event.create(eventData);
    return evento.toObject();
  }

  /**
   * Página de eventos que cumplen el filtro, más el total sin paginar (para totalPages).
   * El orden incluye _id como desempate: sin él, dos eventos con la misma fecha podrían
   * intercambiarse entre páginas.
   * @param {object} filtro            criterios neutros (ver construirConsulta)
   * @param {{ orden: Record<string, 1|-1>, skip: number, limit: number }} paginacion
   * @returns {Promise<{ docs: object[], total: number }>}
   */
  async buscar(filtro, { orden, skip, limit }) {
    const consulta = construirConsulta(filtro);
    const [docs, total] = await Promise.all([
      Event.find(consulta).sort({ ...orden, _id: 1 }).skip(skip).limit(limit).lean(),
      Event.countDocuments(consulta),
    ]);
    return { docs, total };
  }

  async getById(id) {
    return Event.findById(id).lean();
  }

  /**
   * Actualiza un evento. Si se indican estados permitidos, la escritura solo ocurre cuando el
   * evento sigue en uno de ellos (misma operación atómica): evita que dos peticiones
   * simultáneas modifiquen un evento que la otra acaba de cancelar.
   * Si cambia la capacidad, tampoco se escribe cuando quedaría por debajo de los lugares ya
   * reservados. runValidators: los cambios parciales también pasan por las reglas del esquema.
   * @param {string} id
   * @param {object} cambios
   * @param {string[]} [estadosPermitidos]
   * @returns {Promise<object|null>} el evento actualizado, o null si no existe, cambió de estado
   *   o la nueva capacidad no alcanza para los lugares reservados
   */
  async updateById(id, cambios, estadosPermitidos) {
    const condicion = { _id: id };
    if (estadosPermitidos) condicion.status = { $in: estadosPermitidos };
    if (cambios.capacity !== undefined) condicion.seatsTaken = { $not: { $gt: cambios.capacity } };
    return Event.findOneAndUpdate(condicion, cambios, { returnDocument: 'after', runValidators: true }).lean();
  }

  /**
   * Reserva lugares en un evento con una sola operación atómica: la condición (el evento está en
   * el estado indicado y los lugares pedidos caben en la capacidad) y el incremento se evalúan
   * juntos sobre el mismo documento, así dos inscripciones simultáneas nunca pueden tomar el
   * mismo lugar. `$ifNull` cubre eventos creados antes de que existiera el campo.
   * @param {string} id
   * @param {number} cantidad
   * @param {string} estado estado que debe tener el evento para admitir la reserva
   * @returns {Promise<boolean>} false si el evento no existe, cambió de estado o no hay lugar
   */
  async reserveSeats(id, cantidad, estado) {
    const resultado = await Event.updateOne(
      {
        _id: id,
        status: estado,
        $expr: { $lte: [{ $add: [{ $ifNull: ['$seatsTaken', 0] }, cantidad] }, '$capacity'] },
      },
      { $inc: { seatsTaken: cantidad } },
    );
    return resultado.modifiedCount === 1;
  }

  /** Devuelve lugares reservados (cancelación o inscripción que no llegó a crearse). Nunca baja de 0. */
  async releaseSeats(id, cantidad) {
    await Event.updateOne({ _id: id, seatsTaken: { $gte: cantidad } }, { $inc: { seatsTaken: -cantidad } });
  }
}
