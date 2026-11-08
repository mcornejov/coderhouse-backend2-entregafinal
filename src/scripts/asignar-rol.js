import config from '../config/env.config.js';
import { conectarDB, desconectarDB } from '../config/db.config.js';
import UsersDao from '../dao/users.dao.js';
import UsersRepository from '../repositories/users.repository.js';
import UsersService from '../services/users.service.js';
import { USER_ROLES } from '../config/roles.config.js';
import { isValidEmail, normalizeEmail } from '../utils/validators.js';

// Script de administración: asigna un rol a un usuario ya registrado, por email.
// Resuelve el primer admin de una instalación nueva (el registro público solo crea
// usuarios con rol `user` y la ruta PATCH /api/users/:uid/role exige ser admin).
//
//   pnpm asignar-rol ana@mail.com admin        (con npm: npm run asignar-rol -- ana@mail.com admin)
//
// Usa la misma MONGO_URL del .env y pasa por las mismas capas que la API
// (service → repository → dao), así las reglas son idénticas en ambos caminos.

// npm elimina el separador "--" antes de llamar al script; pnpm lo reenvía tal cual.
// Se ignora para que la invocación funcione igual con ambos gestores.
const [emailArg, rolArg] = process.argv.slice(2).filter((arg) => arg !== '--');

if (!isValidEmail(emailArg ?? '') || !rolArg) {
  console.error(`Uso: pnpm asignar-rol <email> <rol>   (roles: ${USER_ROLES.join(', ')})`);
  process.exit(1);
}

const dao = new UsersDao();
const service = new UsersService(new UsersRepository(dao));

try {
  await conectarDB();

  const usuario = await dao.findByEmail(normalizeEmail(emailArg));
  if (!usuario) {
    throw new Error(`No existe un usuario registrado con el email ${normalizeEmail(emailArg)}`);
  }

  const actualizado = await service.asignarRol(usuario._id.toString(), rolArg);
  console.log(`Rol actualizado: ${actualizado.email} → ${actualizado.role} (base ${config.mongoUrl.replace(/\/\/[^/]*@/, '//***@')})`);
  console.log('Si el usuario tiene una sesión abierta, debe volver a iniciar sesión para que el JWT refleje el nuevo rol.');
} catch (error) {
  console.error(`No fue posible asignar el rol: ${error.message}`);
  process.exitCode = 1;
} finally {
  await desconectarDB();
}
