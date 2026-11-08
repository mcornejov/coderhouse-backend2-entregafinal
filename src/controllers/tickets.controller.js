import { responderExito, responderCreado } from '../utils/responses.util.js';

// Controlador de tickets: extrae datos de la petición (params, body, query, req.user),
// delega en el servicio y responde en HTTP. Los errores van al middleware global.
export default class TicketsController {
  constructor(service) {
    this.service = service;
  }

  inscribir = async (req, res, next) => {
    try {
      const ticket = await this.service.inscribir(req.params.eid, req.body, req.user);
      return responderCreado(res, ticket);
    } catch (error) {
      return next(error);
    }
  };

  misTickets = async (req, res, next) => {
    try {
      const tickets = await this.service.misTickets(req.user);
      return responderExito(res, tickets);
    } catch (error) {
      return next(error);
    }
  };

  ticketsDeEvento = async (req, res, next) => {
    try {
      const resumen = await this.service.ticketsDeEvento(req.params.eid, req.user, req.query);
      return responderExito(res, resumen);
    } catch (error) {
      return next(error);
    }
  };

  cancelar = async (req, res, next) => {
    try {
      const ticket = await this.service.cancelar(req.params.tid, req.user);
      return responderExito(res, ticket);
    } catch (error) {
      return next(error);
    }
  };
}
