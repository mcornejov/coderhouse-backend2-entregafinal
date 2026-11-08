import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import { Strategy as JwtStrategy } from 'passport-jwt';
import app from '../src/app.js';
import { iniciarBaseDePrueba, limpiarBaseDePrueba, detenerBaseDePrueba } from './setup.js';

const usuario = {
  first_name: 'Ana',
  last_name: 'Pérez',
  email: 'ana@mail.com',
  password: 'Secreta123',
};

const leer = (ruta) => readFile(new URL(ruta, import.meta.url), 'utf8');

before(iniciarBaseDePrueba);
after(detenerBaseDePrueba);
beforeEach(limpiarBaseDePrueba);

describe('Integración de Passport', () => {
  test('las estrategias register, login y current quedan registradas al cargar la app', () => {
    assert.ok(passport._strategy('register') instanceof LocalStrategy);
    assert.ok(passport._strategy('login') instanceof LocalStrategy);
    assert.ok(passport._strategy('current') instanceof JwtStrategy);
  });

  test('app.js solo inicializa Passport; las estrategias viven en config/passport.config.js', async () => {
    const appJs = await leer('../src/app.js');
    const configJs = await leer('../src/config/passport.config.js');

    assert.match(appJs, /passport\.initialize\(\)/);
    assert.doesNotMatch(appJs, /passport\.use\(|Strategy/);
    assert.match(configJs, /passport\.use\(/);
    assert.match(configJs, /new LocalStrategy|new JwtStrategy/);
  });

  test('la estrategia de login no firma el JWT ni toca la cookie: eso lo hace el controller', async () => {
    const configJs = await leer('../src/config/passport.config.js');
    const controllerJs = await leer('../src/controllers/sessions.controller.js');

    assert.doesNotMatch(configJs, /signToken|res\.cookie|jwt\.sign/);
    assert.match(controllerJs, /signToken\(/);
    assert.match(controllerJs, /res\.cookie\(/);
  });

  test('la ruta de login responde 401 en vez del "Unauthorized" en texto plano de Passport', async () => {
    await request(app).post('/api/sessions/register').send(usuario);
    const res = await request(app).post('/api/sessions/login').send({ email: usuario.email, password: 'otra-clave' });

    assert.equal(res.status, 401);
    assert.match(res.headers['content-type'], /application\/json/);
    assert.deepEqual(res.body, { status: 'error', message: 'Credenciales inválidas' });
  });

  test('passport-local también acepta el login como formulario (x-www-form-urlencoded)', async () => {
    await request(app).post('/api/sessions/register').send(usuario);
    const res = await request(app)
      .post('/api/sessions/login')
      .type('form')
      .send({ email: usuario.email, password: usuario.password });

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { status: 'success', message: 'Login correcto' });
    assert.ok((res.headers['set-cookie'] ?? []).some((c) => c.startsWith('currentUser=')));
  });

  test('las credenciales solo se aceptan en el body, nunca por query string', async () => {
    await request(app).post('/api/sessions/register').send(usuario);
    const res = await request(app).post(`/api/sessions/login?email=${usuario.email}&password=${usuario.password}`);

    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { status: 'error', message: 'Faltan campos obligatorios' });
    assert.equal(res.headers['set-cookie'], undefined);
  });

  test('un token bien firmado pero con otro payload responde 401, no 500', async () => {
    const sinId = jwt.sign({ sub: 'otro-sistema' }, process.env.JWT_SECRET, { algorithm: 'HS256' });
    const texto = jwt.sign('solo-texto', process.env.JWT_SECRET, { algorithm: 'HS256' });

    for (const token of [sinId, texto]) {
      const res = await request(app).get('/api/sessions/current').set('Authorization', `Bearer ${token}`);
      assert.equal(res.status, 401);
      assert.deepEqual(res.body, { status: 'error', message: 'No autenticado' });
    }
  });

  test('el registro vía estrategia sigue ignorando el rol del body', async () => {
    const res = await request(app).post('/api/sessions/register').send({ ...usuario, role: 'admin' });

    assert.equal(res.status, 201);
    assert.equal(res.body.payload.role, 'user');
    assert.equal('password' in res.body.payload, false);
  });
});
