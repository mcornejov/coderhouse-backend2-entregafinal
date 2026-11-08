import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.js';
import { iniciarBaseDePrueba, limpiarBaseDePrueba, detenerBaseDePrueba } from './setup.js';
import { crearUsuarioConRol } from './helpers.js';

const USERS = '/api/users';

before(iniciarBaseDePrueba);
after(detenerBaseDePrueba);
beforeEach(limpiarBaseDePrueba);

describe('GET /api/users (ruta administrativa)', () => {
  test('rol organizer → 403', async () => {
    const organizer = await crearUsuarioConRol('organizer');
    const res = await request(app).get(USERS).set('Cookie', organizer.cookie);
    assert.equal(res.status, 403);
    assert.deepEqual(res.body, { status: 'error', message: 'No tienes permisos para realizar esta acción' });
  });

  test('rol admin → 200 con todos los usuarios, sin contraseñas', async () => {
    await crearUsuarioConRol('user');
    const admin = await crearUsuarioConRol('admin');
    const res = await request(app).get(USERS).set('Cookie', admin.cookie);

    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'success');
    assert.equal(res.body.payload.length, 2);
    assert.deepEqual(res.body.payload.map((u) => u.role), ['user', 'admin']);
    for (const usuario of res.body.payload) {
      assert.deepEqual(Object.keys(usuario).sort(), ['email', 'first_name', 'id', 'last_name', 'role']);
    }
    assert.equal(JSON.stringify(res.body).includes('$2b$'), false, 'ningún hash de bcrypt en la respuesta');
  });

  test('sin cookie → 401', async () => {
    const res = await request(app).get(USERS);
    assert.equal(res.status, 401);
  });
});

describe('PATCH /api/users/:uid/role (ruta administrativa)', () => {
  test('admin promueve a un user a organizer y el nuevo rol rige en el próximo login', async () => {
    const user = await crearUsuarioConRol('user');
    const admin = await crearUsuarioConRol('admin');

    const res = await request(app).patch(`${USERS}/${user.id}/role`).set('Cookie', admin.cookie).send({ role: 'organizer' });
    assert.equal(res.status, 200);
    assert.equal(res.body.payload.role, 'organizer');
    assert.equal(res.body.payload.id, user.id);

    // El JWT emitido antes del cambio conserva el rol anterior (sesión sin estado)
    const antes = await request(app).get('/api/sessions/current').set('Cookie', user.cookie);
    assert.equal(antes.body.payload.role, 'user');

    const login = await request(app).post('/api/sessions/login').send({ email: user.email, password: 'Secreta123' });
    const cookieNueva = login.headers['set-cookie'].find((c) => c.startsWith('currentUser=')).split(';')[0];
    const despues = await request(app).get('/api/sessions/current').set('Cookie', cookieNueva);
    assert.equal(despues.body.payload.role, 'organizer');
  });

  test('un admin no puede cambiar su propio rol → 400', async () => {
    const admin = await crearUsuarioConRol('admin');
    const res = await request(app).patch(`${USERS}/${admin.id}/role`).set('Cookie', admin.cookie).send({ role: 'user' });
    assert.equal(res.status, 400);
    assert.equal(res.body.message, 'No puedes cambiar tu propio rol');
    const sigue = await request(app).get(USERS).set('Cookie', admin.cookie);
    assert.equal(sigue.body.payload.find((u) => u.id === admin.id).role, 'admin');
  });

  test('tampoco con su propio id escrito en mayúsculas (la base lo acepta como el mismo documento)', async () => {
    const admin = await crearUsuarioConRol('admin');
    const res = await request(app).patch(`${USERS}/${admin.id.toUpperCase()}/role`).set('Cookie', admin.cookie).send({ role: 'user' });
    assert.equal(res.status, 400);
    assert.equal(res.body.message, 'No puedes cambiar tu propio rol');
    const sigue = await request(app).get(USERS).set('Cookie', admin.cookie);
    assert.equal(sigue.status, 200);
    assert.equal(sigue.body.payload.find((u) => u.id === admin.id).role, 'admin');
  });

  test('rol inválido → 400 con los roles posibles', async () => {
    const user = await crearUsuarioConRol('user');
    const admin = await crearUsuarioConRol('admin');
    const res = await request(app).patch(`${USERS}/${user.id}/role`).set('Cookie', admin.cookie).send({ role: 'superadmin' });
    assert.equal(res.status, 400);
    assert.equal(res.body.message, 'El rol debe ser uno de: user, organizer, admin');
  });

  test('usuario inexistente → 404; organizer → 403', async () => {
    const admin = await crearUsuarioConRol('admin');
    const organizer = await crearUsuarioConRol('organizer');
    const noExiste = await request(app).patch(`${USERS}/665f2a1b2c3d4e5f6a7b8c9d/role`).set('Cookie', admin.cookie).send({ role: 'admin' });
    assert.equal(noExiste.status, 404);
    const prohibido = await request(app).patch(`${USERS}/${admin.id}/role`).set('Cookie', organizer.cookie).send({ role: 'admin' });
    assert.equal(prohibido.status, 403);
  });
});
