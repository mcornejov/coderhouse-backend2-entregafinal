import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import request from 'supertest';
import app from '../src/app.js';
import { authorize } from '../src/middlewares/authorize.middleware.js';
import { ROLES, USER_ROLES, PERMISOS, DEFAULT_ROLE } from '../src/config/roles.config.js';
import { iniciarBaseDePrueba, limpiarBaseDePrueba, detenerBaseDePrueba } from './setup.js';
import { crearUsuarioConRol, eventoValido } from './helpers.js';

const leer = (ruta) => readFile(new URL(ruta, import.meta.url), 'utf8');

// Ejecuta el middleware con un req simulado y devuelve el error que pasó a next (o null)
function correr(middleware, req) {
  return new Promise((resolve) => middleware(req, {}, (error) => resolve(error ?? null)));
}

before(iniciarBaseDePrueba);
after(detenerBaseDePrueba);
beforeEach(limpiarBaseDePrueba);

describe('Matriz de permisos (config/roles.config.js)', () => {
  test('define los tres roles con user por defecto', () => {
    assert.deepEqual(USER_ROLES, ['user', 'organizer', 'admin']);
    assert.equal(DEFAULT_ROLE, 'user');
  });

  test('crear y modificar eventos: organizer y admin; usuarios: solo admin', () => {
    assert.deepEqual(PERMISOS.CREAR_EVENTO, ['organizer', 'admin']);
    assert.deepEqual(PERMISOS.MODIFICAR_EVENTO, ['organizer', 'admin']);
    assert.deepEqual(PERMISOS.VER_USUARIOS, ['admin']);
    assert.deepEqual(PERMISOS.ASIGNAR_ROL, ['admin']);
  });

  test('la matriz es inmutable', () => {
    assert.throws(() => { PERMISOS.VER_USUARIOS.push('user'); }, TypeError);
    assert.throws(() => { PERMISOS.NUEVA = ['user']; }, TypeError);
  });
});

describe('Middleware authorize(...roles)', () => {
  test('deja pasar a un rol permitido', async () => {
    const error = await correr(authorize(ROLES.ORGANIZER, ROLES.ADMIN), { user: { role: 'organizer' } });
    assert.equal(error, null);
  });

  test('responde 403 con mensaje genérico si el rol no está permitido', async () => {
    const error = await correr(authorize(ROLES.ADMIN), { user: { role: 'organizer' } });
    assert.equal(error.status, 403);
    assert.equal(error.message, 'No tienes permisos para realizar esta acción');
  });

  test('responde 401 (no 500) si se usa sin haber autenticado antes', async () => {
    const error = await correr(authorize(ROLES.ADMIN), {});
    assert.equal(error.status, 401);
    assert.equal(error.message, 'No autenticado');
  });

  test('no acepta roles desconocidos ni listas vacías al construirse (error de programación)', () => {
    assert.throws(() => authorize(), TypeError);
    assert.throws(() => authorize('organiser'), /roles desconocidos: organiser/);
  });

  test('vive en su propio archivo, separado de las rutas, y las rutas no comparan roles a mano', async () => {
    const authorizeJs = await leer('../src/middlewares/authorize.middleware.js');
    const eventsRouter = await leer('../src/routes/events.router.js');
    const usersRouter = await leer('../src/routes/users.router.js');

    assert.match(authorizeJs, /export function authorize\(/);
    for (const router of [eventsRouter, usersRouter]) {
      assert.match(router, /authorize\(\.\.\.PERMISOS\./);
      assert.doesNotMatch(router, /req\.user\.role|'admin'|'organizer'/);
    }
  });
});

describe('401 vs 403 en las rutas protegidas', () => {
  const RUTAS_PRIVADAS = [
    ['get', '/api/sessions/current'],
    ['post', '/api/events'],
    ['put', '/api/events/665f2a1b2c3d4e5f6a7b8c9d'],
    ['patch', '/api/events/665f2a1b2c3d4e5f6a7b8c9d/status'],
    ['post', '/api/events/665f2a1b2c3d4e5f6a7b8c9d/tickets'],
    ['get', '/api/events/665f2a1b2c3d4e5f6a7b8c9d/tickets'],
    ['get', '/api/tickets/my-tickets'],
    ['patch', '/api/tickets/665f2a1b2c3d4e5f6a7b8c9d/cancel'],
    ['get', '/api/users'],
    ['patch', '/api/users/665f2a1b2c3d4e5f6a7b8c9d/role'],
  ];

  test('cualquier ruta privada sin cookie → 401 No autenticado', async () => {
    for (const [metodo, ruta] of RUTAS_PRIVADAS) {
      const res = await request(app)[metodo](ruta).send(eventoValido);
      assert.equal(res.status, 401, `${metodo.toUpperCase()} ${ruta}`);
      assert.deepEqual(res.body, { status: 'error', message: 'No autenticado' });
    }
  });

  test('cualquier ruta privada con token manipulado → 401', async () => {
    for (const [metodo, ruta] of RUTAS_PRIVADAS) {
      const res = await request(app)[metodo](ruta).set('Cookie', 'currentUser=token.manipulado.xyz');
      assert.equal(res.status, 401, `${metodo.toUpperCase()} ${ruta}`);
    }
  });

  test('con sesión pero sin rol suficiente → 403, nunca 401 ni 500', async () => {
    const user = await crearUsuarioConRol('user');
    const casos = [
      ['post', '/api/events'],
      ['put', '/api/events/665f2a1b2c3d4e5f6a7b8c9d'],
      ['patch', '/api/events/665f2a1b2c3d4e5f6a7b8c9d/status'],
      ['get', '/api/events/665f2a1b2c3d4e5f6a7b8c9d/tickets'],
      ['get', '/api/users'],
      ['patch', '/api/users/665f2a1b2c3d4e5f6a7b8c9d/role'],
    ];
    for (const [metodo, ruta] of casos) {
      const res = await request(app)[metodo](ruta).set('Cookie', user.cookie).send(eventoValido);
      assert.equal(res.status, 403, `${metodo.toUpperCase()} ${ruta}`);
      assert.deepEqual(res.body, { status: 'error', message: 'No tienes permisos para realizar esta acción' });
    }
  });

  test('/current solo exige estar autenticado: los tres roles reciben 200', async () => {
    for (const role of USER_ROLES) {
      const usuario = await crearUsuarioConRol(role);
      const res = await request(app).get('/api/sessions/current').set('Cookie', usuario.cookie);
      assert.equal(res.status, 200);
      assert.equal(res.body.payload.role, role);
    }
  });
});
