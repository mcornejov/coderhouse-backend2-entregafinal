import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.js';
import User from '../src/models/User.js';
import { comparePassword } from '../src/utils/hash.js';
import { iniciarBaseDePrueba, limpiarBaseDePrueba, detenerBaseDePrueba } from './setup.js';

const REGISTER = '/api/sessions/register';

const usuarioValido = {
  first_name: 'Ana',
  last_name: 'Pérez',
  email: 'Ana@Mail.com ',
  password: 'Secreta123',
};

before(iniciarBaseDePrueba);
after(detenerBaseDePrueba);
beforeEach(limpiarBaseDePrueba);

describe('POST /api/sessions/register', () => {
  test('registra un usuario, normaliza el email y no devuelve la contraseña', async () => {
    const res = await request(app).post(REGISTER).send(usuarioValido);

    assert.equal(res.status, 201);
    assert.equal(res.body.status, 'success');
    assert.equal(res.body.payload.first_name, 'Ana');
    assert.equal(res.body.payload.last_name, 'Pérez');
    assert.equal(res.body.payload.email, 'ana@mail.com');
    assert.equal(res.body.payload.role, 'user');
    assert.equal(typeof res.body.payload.id, 'string');
    assert.equal('password' in res.body.payload, false);
    assert.equal(JSON.stringify(res.body).includes('Secreta123'), false);
  });

  test('guarda la contraseña hasheada con bcrypt, nunca en texto plano', async () => {
    await request(app).post(REGISTER).send(usuarioValido);

    const guardado = await User.findOne({ email: 'ana@mail.com' }).lean();
    assert.ok(guardado);
    assert.notEqual(guardado.password, 'Secreta123');
    assert.match(guardado.password, /^\$2[aby]\$\d{2}\$/);
    assert.equal(await comparePassword('Secreta123', guardado.password), true);
    assert.equal(await comparePassword('otraClave', guardado.password), false);
  });

  test('ignora el rol enviado en el body y asigna user por defecto', async () => {
    const res = await request(app).post(REGISTER).send({ ...usuarioValido, role: 'admin' });

    assert.equal(res.status, 201);
    assert.equal(res.body.payload.role, 'user');
    const guardado = await User.findOne({ email: 'ana@mail.com' }).lean();
    assert.equal(guardado.role, 'user');
  });

  test('responde 400 si faltan campos obligatorios', async () => {
    const res = await request(app).post(REGISTER).send({ email: 'ana@mail.com', password: 'Secreta123' });

    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { status: 'error', message: 'Faltan campos obligatorios' });
    assert.equal(await User.countDocuments(), 0);
  });

  test('responde 400 si el body está vacío', async () => {
    const res = await request(app).post(REGISTER).send({});
    assert.equal(res.status, 400);
    assert.equal(res.body.status, 'error');
  });

  test('responde 400 si el email tiene formato inválido', async () => {
    const res = await request(app).post(REGISTER).send({ ...usuarioValido, email: 'correo-invalido' });

    assert.equal(res.status, 400);
    assert.equal(res.body.status, 'error');
    assert.equal(await User.countDocuments(), 0);
  });

  test('responde 400 si la contraseña tiene menos de 8 caracteres', async () => {
    const res = await request(app).post(REGISTER).send({ ...usuarioValido, password: '1234567' });

    assert.equal(res.status, 400);
    assert.equal(res.body.status, 'error');
    assert.equal(await User.countDocuments(), 0);
  });

  test('responde 400 si la contraseña supera los 72 bytes (límite de bcrypt)', async () => {
    const larga = 'a'.repeat(73);
    const multibyte = 'ñ'.repeat(37); // 74 bytes en UTF-8
    for (const password of [larga, multibyte]) {
      const res = await request(app).post(REGISTER).send({ ...usuarioValido, password });
      assert.equal(res.status, 400);
      assert.equal(res.body.status, 'error');
    }
    assert.equal(await User.countDocuments(), 0);
  });

  test('acepta una contraseña de exactamente 72 bytes', async () => {
    const res = await request(app).post(REGISTER).send({ ...usuarioValido, password: 'a'.repeat(72) });
    assert.equal(res.status, 201);
  });

  test('responde 409 si el email ya está registrado (sin importar mayúsculas o espacios)', async () => {
    await request(app).post(REGISTER).send(usuarioValido);
    const res = await request(app).post(REGISTER).send({ ...usuarioValido, email: '  ANA@mail.COM' });

    assert.equal(res.status, 409);
    assert.deepEqual(res.body, { status: 'error', message: 'El email ya está registrado' });
    assert.equal(await User.countDocuments(), 1);
  });
});
