// DTO de evento: forma única en que un evento sale de la capa de datos.
// Convierte los ObjectId a string (el id del JWT también es string, así la
// comparación de propiedad organizer === user.id no depende de tipos).

// Acepta un ObjectId, un documento poblado ({ _id, ... }) o null
function idDe(valor) {
  if (valor == null) return null;
  return String(valor._id ?? valor);
}

export function toEventDTO(evento) {
  return {
    id: idDe(evento._id),
    title: evento.title,
    description: evento.description,
    category: evento.category,
    date: evento.date,
    location: evento.location,
    capacity: evento.capacity,
    price: evento.price,
    status: evento.status,
    organizer: idDe(evento.organizer),
    createdAt: evento.createdAt,
    updatedAt: evento.updatedAt,
  };
}
