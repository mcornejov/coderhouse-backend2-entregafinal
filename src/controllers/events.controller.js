import { responderExito, responderCreado, responderListado } from '../utils/responses.util.js';

// Controlador de eventos: extrae datos de la petición (query, body, params, req.user),
// delega en el servicio y responde en HTTP. Los errores van al middleware global.
export default class EventsController {
  constructor(service) {
    this.service = service;
  }

  listar = async (req, res, next) => {
    try {
      const listado = await this.service.listar(req.query);
      return responderListado(res, listado);
    } catch (error) {
      return next(error);
    }
  };

  obtenerPorId = async (req, res, next) => {
    try {
      const evento = await this.service.obtenerPorId(req.params.eid);
      return responderExito(res, evento);
    } catch (error) {
      return next(error);
    }
  };

  crear = async (req, res, next) => {
    try {
      const evento = await this.service.crear(req.body, req.user);
      return responderCreado(res, evento);
    } catch (error) {
      return next(error);
    }
  };

  actualizar = async (req, res, next) => {
    try {
      const evento = await this.service.actualizar(req.params.eid, req.body, req.user);
      return responderExito(res, evento);
    } catch (error) {
      return next(error);
    }
  };

  cambiarEstado = async (req, res, next) => {
    try {
      const evento = await this.service.cambiarEstado(req.params.eid, req.body, req.user);
      return responderExito(res, evento);
    } catch (error) {
      return next(error);
    }
  };
}
