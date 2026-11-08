// DTO de ticket: forma única en que una inscripción sale de la capa de datos.
// Las referencias (`user`, `event`) salen como id en texto; si la consulta las pobló, salen como
// un resumen con solo los campos públicos (del usuario nunca la contraseña ni el rol).

function idDe(valor) {
  if (valor == null) return null;
  return String(valor._id ?? valor);
}

function eventoResumido(event) {
  if (event == null || typeof event !== 'object' || !('title' in event)) return idDe(event);
  return { id: idDe(event), title: event.title, date: event.date, location: event.location };
}

function usuarioResumido(user) {
  if (user == null || typeof user !== 'object' || !('email' in user)) return idDe(user);
  return { id: idDe(user), first_name: user.first_name, last_name: user.last_name, email: user.email };
}

export function toTicketDTO(ticket) {
  return {
    id: idDe(ticket._id),
    user: usuarioResumido(ticket.user),
    event: eventoResumido(ticket.event),
    status: ticket.status,
    quantity: ticket.quantity,
    reservationCode: ticket.reservationCode,
    createdAt: ticket.createdAt,
    cancelledAt: ticket.cancelledAt ?? null,
  };
}
