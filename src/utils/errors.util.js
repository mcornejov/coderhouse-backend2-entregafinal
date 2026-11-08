// Error con código HTTP asociado. Las capas internas lanzan estos errores y
// el middleware global los traduce a la respuesta correspondiente.
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

export class BadRequestError extends HttpError {
  constructor(message = 'Petición inválida') {
    super(400, message);
    this.name = 'BadRequestError';
  }
}

// 401: no se pudo establecer quién es el cliente (sin credenciales o credenciales inválidas)
export class UnauthorizedError extends HttpError {
  constructor(message = 'No autenticado') {
    super(401, message);
    this.name = 'UnauthorizedError';
  }
}

// 403: el cliente está identificado pero no tiene permiso para la acción
export class ForbiddenError extends HttpError {
  constructor(message = 'No tienes permisos para realizar esta acción') {
    super(403, message);
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends HttpError {
  constructor(message = 'Recurso no encontrado') {
    super(404, message);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends HttpError {
  constructor(message = 'El recurso ya existe') {
    super(409, message);
    this.name = 'ConflictError';
  }
}
