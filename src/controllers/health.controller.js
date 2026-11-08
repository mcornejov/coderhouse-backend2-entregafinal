// Verificación de estado del servidor, útil para monitoreo y despliegues.
export function healthCheck(req, res) {
  return res.status(200).json({ status: 'ok', message: 'Servidor activo' });
}
