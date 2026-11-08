import { Router } from 'express';
import TicketsDao from '../dao/tickets.dao.js';
import TicketsRepository from '../repositories/tickets.repository.js';
import TicketsService from '../services/tickets.service.js';
import TicketsController from '../controllers/tickets.controller.js';
import EventsDao from '../dao/events.dao.js';
import EventsRepository from '../repositories/events.repository.js';
import UsersDao from '../dao/users.dao.js';
import UsersRepository from '../repositories/users.repository.js';
import MailService from '../services/mail.service.js';
import { transporter } from '../config/mail.config.js';
import config from '../config/env.config.js';
import { auth } from '../middlewares/auth.middleware.js';

// Composición de la cadena de capas del recurso tickets:
// router → controller → service → repositories → daos. El servicio recibe además los repositorios
// de eventos (cargar el evento) y usuarios (email del dueño al cancelar) y el servicio de correo.
export const ticketsController = new TicketsController(
  new TicketsService(
    new TicketsRepository(new TicketsDao()),
    new EventsRepository(new EventsDao()),
    new UsersRepository(new UsersDao()),
    new MailService(transporter, config.mail)
  )
);

const router = Router();

// Ambas rutas exigen sesión (cualquier rol); la propiedad del ticket la verifica el servicio.
router.get('/my-tickets', auth, ticketsController.misTickets);
router.patch('/:tid/cancel', auth, ticketsController.cancelar);

// Las rutas anidadas POST /api/events/:eid/tickets y GET /api/events/:eid/tickets
// viven en events.router.js y usan este mismo controller.
export default router;
