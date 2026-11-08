import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.js';
import Event from '../src/models/Event.js';
import EventsService from '../src/services/events.service.js';
import { ESTADOS_FINALES, ESTADOS_MODIFICABLES } from '../src/config/events.config.js';
import { iniciarBaseDePrueba, limpiarBaseDePrueba, detenerBaseDePrueba } from './setup.js';
import { crearUsuarioConRol, eventoValido } from './helpers.js';

// Reglas de negocio sobre el contenido del evento (crear y modificar), más allá de la
// autorización ya cubierta en events.test.js: fecha futura, obligatorios, categoría
// normalizada y eventos en estado final que no se modifican.

const EVENTS = '/api/events';

before(iniciarBaseDePrueba);
after(detenerBaseDePrueba);
beforeEach(limpiarBaseDePrueba);

async function crearEventoComo(usuario, datos = eventoValido) {
  const res = await request(app).post(EVENTS).set('Cookie', usuario.cookie).send(datos);
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.payload;
}

describe('Fecha pasada', () => {
  test('crear con fecha pasada → 400 y no se guarda', async () => {
    const organizer = await crearUsuarioConRol('organizer');
    for (const date of ['2020-01-01', '2020-01-01T10:00:00.000Z', '1999-12-31']) {
      const res = await request(app).post(EVENTS).set('Cookie', organizer.cookie).send({ ...eventoValido, date });
      assert.equal(res.status, 400, date);
      assert.deepEqual(res.body, { status: 'error', message: 'La fecha del evento no puede ser pasada' });
    }
    assert.equal(await Event.countDocuments(), 0);
  });

  test('modificar la fecha a una pasada → 400 y el evento conserva la original', async () => {
    const organizer = await crearUsuarioConRol('organizer');
    const creado = await crearEventoComo(organizer);
    const res = await request(app).put(`${EVENTS}/${creado.id}`).set('Cookie', organizer.cookie).send({ date: '2020-05-05' });
    assert.equal(res.status, 400);
    assert.equal(res.body.message, 'La fecha del evento no puede ser pasada');
    const enBase = await Event.findById(creado.id).lean();
    assert.equal(enBase.date.toISOString(), eventoValido.date);
  });

  test('la comparación usa el reloj inyectado: el instante exacto de "ahora" también es pasado', async () => {
    const ahora = new Date('2027-03-15T19:00:00.000Z');
    const service = new EventsService({ create: async (d) => d }, { ahora: () => ahora });
    const usuario = { id: 'org-1', role: 'organizer' };
    await assert.rejects(service.crear({ ...eventoValido, date: '2027-03-15T19:00:00.000Z' }, usuario), { status: 400 });
    const creado = await service.crear({ ...eventoValido, date: '2027-03-15T19:00:00.001Z' }, usuario);
    assert.equal(creado.organizer, 'org-1');
  });
});

describe('Campos obligatorios y normalización', () => {
  test('description y category son obligatorios', async () => {
    const organizer = await crearUsuarioConRol('organizer');
    const { description, category, ...sinAmbos } = eventoValido;
    const res = await request(app).post(EVENTS).set('Cookie', organizer.cookie).send(sinAmbos);
    assert.equal(res.status, 400);
    assert.equal(res.body.message, 'Faltan campos obligatorios: description, category');
  });

  test('category y description deben ser texto no vacío', async () => {
    const organizer = await crearUsuarioConRol('organizer');
    const casos = [
      [{ category: '  ' }, 'El campo category debe ser un texto no vacío'],
      [{ category: 7 }, 'El campo category debe ser un texto no vacío'],
      [{ description: null }, 'El campo description debe ser un texto no vacío'],
      [{ description: ['x'] }, 'El campo description debe ser un texto no vacío'],
      [{ price: Infinity }, 'El campo price debe ser un número mayor o igual a 0'],
    ];
    for (const [cambio, mensaje] of casos) {
      const res = await request(app).post(EVENTS).set('Cookie', organizer.cookie).send({ ...eventoValido, ...cambio });
      assert.equal(res.status, 400, JSON.stringify(cambio));
      assert.equal(res.body.message, mensaje);
    }
  });

  test('los textos tienen largo máximo (service y esquema)', async () => {
    const organizer = await crearUsuarioConRol('organizer');
    const res = await request(app).post(EVENTS).set('Cookie', organizer.cookie).send({ ...eventoValido, title: 'x'.repeat(201) });
    assert.equal(res.status, 400);
    assert.equal(res.body.message, 'El campo title no puede superar los 200 caracteres');
    const justo = await request(app).post(EVENTS).set('Cookie', organizer.cookie).send({ ...eventoValido, title: 'x'.repeat(200) });
    assert.equal(justo.status, 201);
    await assert.rejects(Event.create({ ...eventoValido, location: 'y'.repeat(201), organizer: '665f2a1b2c3d4e5f6a7b8c9d' }), { name: 'ValidationError' });
  });

  test('category se guarda en minúsculas y sin espacios en los extremos', async () => {
    const organizer = await crearUsuarioConRol('organizer');
    const creado = await crearEventoComo(organizer, { ...eventoValido, category: '  Taller ' });
    assert.equal(creado.category, 'taller');
    const editado = await request(app).put(`${EVENTS}/${creado.id}`).set('Cookie', organizer.cookie).send({ category: 'CHARLA' });
    assert.equal(editado.body.payload.category, 'charla');
  });

  test('el DTO expone organizer como id (referencia), no como usuario embebido', async () => {
    const organizer = await crearUsuarioConRol('organizer');
    const creado = await crearEventoComo(organizer);
    assert.equal(typeof creado.organizer, 'string');
    assert.equal(creado.organizer, organizer.id);
    const enBase = await Event.findById(creado.id).lean();
    assert.equal(String(enBase.organizer), organizer.id);
    assert.equal(enBase.organizer.email, undefined, 'solo se guarda el ObjectId');
  });

  test('el esquema de Mongoose es segunda barrera: capacity 0 o status inválido no se guardan', async () => {
    await assert.rejects(Event.create({ ...eventoValido, capacity: 0, organizer: '665f2a1b2c3d4e5f6a7b8c9d' }), { name: 'ValidationError' });
    await assert.rejects(Event.create({ ...eventoValido, status: 'borrador', organizer: '665f2a1b2c3d4e5f6a7b8c9d' }), { name: 'ValidationError' });
  });
});

describe('Eventos en estado final no se modifican', () => {
  for (const estado of ESTADOS_FINALES) {
    test(`PUT sobre un evento ${estado} → 409 y nada cambia`, async () => {
      const organizer = await crearUsuarioConRol('organizer');
      const creado = await crearEventoComo(organizer);
      await Event.updateOne({ _id: creado.id }, { status: estado });

      const res = await request(app).put(`${EVENTS}/${creado.id}`).set('Cookie', organizer.cookie).send({ title: 'Otro' });
      assert.equal(res.status, 409);
      assert.equal(res.body.status, 'error');
      assert.match(res.body.message, /no admite modificaciones/);
      const enBase = await Event.findById(creado.id).lean();
      assert.equal(enBase.title, eventoValido.title);
    });
  }

  test('ni siquiera un admin modifica un evento cancelado', async () => {
    const organizer = await crearUsuarioConRol('organizer');
    const admin = await crearUsuarioConRol('admin');
    const creado = await crearEventoComo(organizer);
    await Event.updateOne({ _id: creado.id }, { status: 'cancelled' });
    const res = await request(app).put(`${EVENTS}/${creado.id}`).set('Cookie', admin.cookie).send({ title: 'Otro' });
    assert.equal(res.status, 409);
    assert.equal(res.body.message, 'El evento está cancelado y no admite modificaciones');
  });

  test('la propiedad se verifica antes que el estado: un intruso recibe 403, no 409', async () => {
    const duenio = await crearUsuarioConRol('organizer', 'duenio@mail.com');
    const intruso = await crearUsuarioConRol('organizer', 'intruso@mail.com');
    const creado = await crearEventoComo(duenio);
    await Event.updateOne({ _id: creado.id }, { status: 'cancelled' });
    const res = await request(app).put(`${EVENTS}/${creado.id}`).set('Cookie', intruso.cookie).send({ title: 'Otro' });
    assert.equal(res.status, 403);
  });

  test('la escritura es condicional: si otra petición canceló el evento entre leer y escribir → 409', async () => {
    const repositorio = {
      getById: async () => ({ id: 'x', organizer: 'org-1', status: 'cancelled' }),
      actualizarSiModificable: async () => null,
      cambiarEstado: async () => null,
    };
    // Primera lectura devuelve draft (pasa las validaciones), la escritura falla, la relectura ve cancelled
    let lecturas = 0;
    repositorio.getById = async () => ({ id: 'x', organizer: 'org-1', status: lecturas++ === 0 ? 'draft' : 'cancelled' });
    const service = new EventsService(repositorio);
    await assert.rejects(
      service.actualizar('x', { title: 'Nuevo' }, { id: 'org-1', role: 'organizer' }),
      { status: 409, message: 'El evento cambió a estado cancelled mientras se procesaba la petición' }
    );
  });

  test('el servicio escribe por el método de dominio que exige un estado modificable', async () => {
    let llamado = null;
    const repositorio = {
      getById: async () => ({ id: 'x', organizer: 'org-1', status: 'published' }),
      actualizarSiModificable: async (id, cambios) => { llamado = { id, cambios }; return { id, ...cambios }; },
    };
    const resultado = await new EventsService(repositorio).actualizar('x', { title: 'Nuevo' }, { id: 'org-1', role: 'organizer' });
    assert.deepEqual(llamado, { id: 'x', cambios: { title: 'Nuevo' } });
    assert.equal(resultado.title, 'Nuevo');
    // La lista de estados modificables sale de la tabla, no la decide el servicio
    assert.deepEqual(ESTADOS_MODIFICABLES, ['draft', 'published']);
  });
});
