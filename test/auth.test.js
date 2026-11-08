import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import { signToken } from '../src/utils/jwt.js';
import { iniciarBaseDePrueba, limpiarBaseDePrueba, detenerBaseDePrueba } from './setup.js';

const REGISTER = '/api/sessions/register';
const LOGIN = '/api/sessions/login';
const CURRENT = '/api/sessions/current';
const LOGOUT = '/api/sessions/logout';

const usuario = {
  first_name: 'Ana',
  last_name: 'Pérez',
  email: 'ana@mail.com',
  password: 'Secreta123',
};

// Devuelve el header Set-Cookie de la cookie de sesión (o undefined si no viene)
function cookieDeSesion(res) {
  return (res.headers['set-cookie'] ?? []).find((c) => c.startsWith('currentUser='));
}

// Extrae "currentUser=<valor>" para reenviarlo en la siguiente petición
function soloCookie(setCookie) {
  return setCookie.split(';')[0];
}

before(iniciarBaseDePrueba);
after(detenerBaseDePrueba);
beforeEach(async () => {
  await limpiarBaseDePrueba();
  await request(app).post(REGISTER).send(usuario);
});

describe('POST /api/sessions/login', () => {
  test('responde 200 "Login correcto" y setea la cookie currentUser httpOnly', async () => {
    const res = await request(app).post(LOGIN).send({ email: usuario.email, password: usuario.password });

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { status: 'success', message: 'Login correcto' });

    const cookie = cookieDeSesion(res);
    assert.ok(cookie, 'debe venir la cookie currentUser');
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Lax/i);
    assert.match(cookie, /Max-Age=3600(;|$)/i);
    assert.doesNotMatch(cookie, /Secure/i, 'fuera de producción la cookie no es secure');
  });

  test('el JWT contiene solo { id, email, role } y nunca la contraseña', async () => {
    const res = await request(app).post(LOGIN).send({ email: usuario.email, password: usuario.password });
    const token = soloCookie(cookieDeSesion(res)).replace('currentUser=', '');

    const payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    assert.deepEqual(Object.keys(payload).sort(), ['email', 'exp', 'iat', 'id', 'role']);
    assert.equal(payload.email, usuario.email);
    assert.equal(payload.role, 'user');
    assert.equal(typeof payload.id, 'string');
    assert.equal(JSON.stringify(payload).includes('Secreta123'), false);
    assert.equal(JSON.stringify(res.body).includes(token), false, 'el token no viaja en el body');
  });

  test('acepta el email con mayúsculas y espacios (normalización)', async () => {
    const res = await request(app).post(LOGIN).send({ email: '  ANA@Mail.com ', password: usuario.password });
    assert.equal(res.status, 200);
  });

  test('responde 401 genérico si el email no existe', async () => {
    const res = await request(app).post(LOGIN).send({ email: 'nadie@mail.com', password: usuario.password });

    assert.equal(res.status, 401);
    assert.deepEqual(res.body, { status: 'error', message: 'Credenciales inválidas' });
    assert.equal(cookieDeSesion(res), undefined);
  });

  test('responde 401 genérico si la contraseña es incorrecta', async () => {
    const res = await request(app).post(LOGIN).send({ email: usuario.email, password: 'Incorrecta123' });

    assert.equal(res.status, 401);
    assert.deepEqual(res.body, { status: 'error', message: 'Credenciales inválidas' });
    assert.equal(cookieDeSesion(res), undefined);
  });

  test('responde 400 si faltan email o password', async () => {
    const sinPassword = await request(app).post(LOGIN).send({ email: usuario.email });
    const vacio = await request(app).post(LOGIN).send({});

    assert.equal(sinPassword.status, 400);
    assert.deepEqual(sinPassword.body, { status: 'error', message: 'Faltan campos obligatorios' });
    assert.equal(vacio.status, 400);
  });
});

describe('GET /api/sessions/current', () => {
  test('responde 200 con { id, email, role } usando la cookie del login', async () => {
    const login = await request(app).post(LOGIN).send({ email: usuario.email, password: usuario.password });
    const res = await request(app).get(CURRENT).set('Cookie', soloCookie(cookieDeSesion(login)));

    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'success');
    assert.deepEqual(Object.keys(res.body.payload).sort(), ['email', 'id', 'role']);
    assert.equal(res.body.payload.email, usuario.email);
    assert.equal(res.body.payload.role, 'user');
    assert.equal(JSON.stringify(res.body).includes('password'), false);
  });

  test('también acepta el token en el header Authorization: Bearer', async () => {
    const token = signToken({ id: '665f2a0000000000000000aa', email: usuario.email, role: 'user' });
    const res = await request(app).get(CURRENT).set('Authorization', `Bearer ${token}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.payload.id, '665f2a0000000000000000aa');
  });

  test('responde 401 "No autenticado" sin cookie', async () => {
    const res = await request(app).get(CURRENT);

    assert.equal(res.status, 401);
    assert.deepEqual(res.body, { status: 'error', message: 'No autenticado' });
  });

  test('responde 401 con un token manipulado', async () => {
    const login = await request(app).post(LOGIN).send({ email: usuario.email, password: usuario.password });
    const token = soloCookie(cookieDeSesion(login)).replace('currentUser=', '');
    const [header, , firma] = token.split('.');

    // Payload alterado (rol admin) manteniendo la firma original
    const payloadAlterado = Buffer.from(JSON.stringify({ id: '1', email: usuario.email, role: 'admin' }))
      .toString('base64url');
    const manipulado = await request(app).get(CURRENT).set('Cookie', `currentUser=${header}.${payloadAlterado}.${firma}`);
    const basura = await request(app).get(CURRENT).set('Cookie', 'currentUser=no-es-un-jwt');
    const firmadoConOtroSecreto = await request(app).get(CURRENT).set(
      'Cookie',
      `currentUser=${jwt.sign({ id: '1', email: usuario.email, role: 'admin' }, 'otro-secreto')}`
    );

    for (const res of [manipulado, basura, firmadoConOtroSecreto]) {
      assert.equal(res.status, 401);
      assert.deepEqual(res.body, { status: 'error', message: 'No autenticado' });
    }
  });

  test('responde 401 con un token expirado', async () => {
    const expirado = jwt.sign(
      { id: '1', email: usuario.email, role: 'user' },
      process.env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: -1 }
    );
    const res = await request(app).get(CURRENT).set('Cookie', `currentUser=${expirado}`);

    assert.equal(res.status, 401);
    assert.deepEqual(res.body, { status: 'error', message: 'No autenticado' });
  });

  test('responde 401 con un token firmado con algoritmo "none"', async () => {
    const sinFirma = jwt.sign({ id: '1', email: usuario.email, role: 'admin' }, '', { algorithm: 'none' });
    const res = await request(app).get(CURRENT).set('Cookie', `currentUser=${sinFirma}`);

    assert.equal(res.status, 401);
  });
});

describe('POST /api/sessions/logout', () => {
  test('responde "Sesión cerrada" y elimina la cookie currentUser', async () => {
    const res = await request(app).post(LOGOUT);

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { status: 'success', message: 'Sesión cerrada' });
    const cookie = cookieDeSesion(res);
    assert.ok(cookie, 'debe enviar la cookie vencida para que el navegador la borre');
    assert.match(cookie, /Expires=Thu, 01 Jan 1970/i);
  });
});

describe('Flujo completo', () => {
  test('registro → login → current 200 → logout → current 401', async () => {
    const registro = await request(app).post(REGISTER).send({ ...usuario, email: 'bruno@mail.com' });
    assert.equal(registro.status, 201);

    const login = await request(app).post(LOGIN).send({ email: 'bruno@mail.com', password: usuario.password });
    assert.equal(login.status, 200);
    const cookie = soloCookie(cookieDeSesion(login));

    const current = await request(app).get(CURRENT).set('Cookie', cookie);
    assert.equal(current.status, 200);
    assert.equal(current.body.payload.id, registro.body.payload.id);
    assert.equal(current.body.payload.email, 'bruno@mail.com');

    const logout = await request(app).post(LOGOUT).set('Cookie', cookie);
    assert.equal(logout.status, 200);

    // El navegador descarta la cookie vencida: la siguiente petición llega sin ella
    const cookieTrasLogout = soloCookie(cookieDeSesion(logout));
    assert.equal(cookieTrasLogout, 'currentUser=');
    const sinSesion = await request(app).get(CURRENT).set('Cookie', cookieTrasLogout);
    assert.equal(sinSesion.status, 401);
    assert.deepEqual(sinSesion.body, { status: 'error', message: 'No autenticado' });
  });
});
