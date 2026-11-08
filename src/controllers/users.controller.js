import { responderExito } from '../utils/responses.util.js';

// Controlador administrativo de usuarios: solo HTTP, delega en el servicio.
export default class UsersController {
  constructor(service) {
    this.service = service;
  }

  listar = async (req, res, next) => {
    try {
      const usuarios = await this.service.listar();
      return responderExito(res, usuarios);
    } catch (error) {
      return next(error);
    }
  };

  asignarRol = async (req, res, next) => {
    try {
      const usuario = await this.service.asignarRol(req.params.uid, req.body?.role, req.user);
      return responderExito(res, usuario);
    } catch (error) {
      return next(error);
    }
  };
}
