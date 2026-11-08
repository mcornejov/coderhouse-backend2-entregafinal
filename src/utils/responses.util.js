// Helpers de respuesta para mantener un formato uniforme en toda la API:
// éxito → { status: 'success', payload } · confirmación → { status: 'success', message }
// listado paginado → { status: 'success', data, page, limit, total, totalPages }
// error → { status: 'error', message }
export function responderExito(res, payload, status = 200) {
  return res.status(status).json({ status: 'success', payload });
}

export function responderCreado(res, payload) {
  return responderExito(res, payload, 201);
}

export function responderMensaje(res, message, status = 200) {
  return res.status(status).json({ status: 'success', message });
}

/**
 * @param {import('express').Response} res
 * @param {{ data: object[], page: number, limit: number, total: number, totalPages: number }} listado
 */
export function responderListado(res, { data, page, limit, total, totalPages }) {
  return res.status(200).json({ status: 'success', data, page, limit, total, totalPages });
}

export function responderError(res, status, message) {
  return res.status(status).json({ status: 'error', message });
}
