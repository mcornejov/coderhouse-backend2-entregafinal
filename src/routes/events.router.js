import { Router } from 'express';
import EventsDao from '../dao/events.dao.js';
import EventsRepository from '../repositories/events.repository.js';
import EventsService from '../services/events.service.js';
import EventsController from '../controllers/events.controller.js';
import { auth } from '../middlewares/auth.middleware.js';
import { authorize } from '../middlewares/authorize.middleware.js';
import { PERMISOS } from '../config/roles.config.js';
import { ticketsController } from './tickets.router.js';

// Composición de la cadena de capas del recurso events:
// router → controller → service → repository → dao
const controller = new EventsController(
  new EventsService(new EventsRepository(new EventsDao()))
);

const router = Router();

// Consulta pública: cualquiera puede ver los eventos (listado paginado con filtros y detalle)
router.get('/', controller.listar);
router.get('/:eid', controller.obtenerPorId);

// Rutas protegidas: primero quién eres (auth → 401), luego qué puedes hacer (authorize → 403).
// Los roles salen de la matriz de permisos, no se escriben en la ruta.
router.post('/', auth, authorize(...PERMISOS.CREAR_EVENTO), controller.crear);
// organizer solo los propios, admin cualquiera: la propiedad la verifica el servicio
router.put('/:eid', auth, authorize(...PERMISOS.MODIFICAR_EVENTO), controller.actualizar);
// Publicar, cancelar o finalizar: cambio de estado según la tabla de transiciones
router.patch('/:eid/status', auth, authorize(...PERMISOS.CAMBIAR_ESTADO_EVENTO), controller.cambiarEstado);

// Inscripciones anidadas bajo el evento. Inscribirse solo exige sesión (cualquier rol); las reglas
// (evento publicado, cupo, duplicados) las aplica el servicio de tickets.
router.post('/:eid/tickets', auth, ticketsController.inscribir);
// Lista de inscritos: organizer dueño del evento (lo verifica el servicio) o admin
router.get('/:eid/tickets', auth, authorize(...PERMISOS.VER_INSCRIPCIONES_EVENTO), ticketsController.ticketsDeEvento);

export default router;
