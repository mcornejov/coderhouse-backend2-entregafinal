import { Router } from 'express';
import SessionsController from '../controllers/sessions.controller.js';
import { autenticarCon, auth } from '../middlewares/auth.middleware.js';

// Rutas de sesión: cada una delega la autenticación en passport.authenticate(...)
// (envuelto por autenticarCon para responder JSON) y deja al controller solo HTTP.
const controller = new SessionsController();

const router = Router();

router.post('/register', autenticarCon('register'), controller.register);
router.post('/login', autenticarCon('login', { mensaje401: 'Credenciales inválidas' }), controller.login);
router.get('/current', auth, controller.current);
router.post('/logout', controller.logout);

export default router;
