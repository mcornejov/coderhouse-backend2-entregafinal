import { Router } from 'express';
import UsersDao from '../dao/users.dao.js';
import UsersRepository from '../repositories/users.repository.js';
import UsersService from '../services/users.service.js';
import UsersController from '../controllers/users.controller.js';
import { auth } from '../middlewares/auth.middleware.js';
import { authorize } from '../middlewares/authorize.middleware.js';
import { PERMISOS } from '../config/roles.config.js';

// Recurso administrativo: todas sus rutas exigen sesión (401) y rol admin (403)
const controller = new UsersController(
  new UsersService(new UsersRepository(new UsersDao()))
);

const router = Router();

router.get('/', auth, authorize(...PERMISOS.VER_USUARIOS), controller.listar);
router.patch('/:uid/role', auth, authorize(...PERMISOS.ASIGNAR_ROL), controller.asignarRol);

export default router;
