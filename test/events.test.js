import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.js';
import Event from '../src/models/Event.js';
import EventsService from '../src/services/events.service.js';
import { iniciarBaseDePrueba, limpiarBaseDePrueba, detenerBaseDePrueba } from './setup.js';
import { crearUsuarioConRol, eventoValido } from './helpers.js';

const EVENTS = '/api/events';

before(iniciarBaseDePrueba);
after(detenerBaseDePrueba);
beforeEach(limpiarBaseDePrueba);

async function crearEventoComo(usuario, datos = eventoValido) {
  const res = await request(app).post(EVENTS).set('Cookie', usuario.cookie).send(datos);
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.payload;
}

describe('POST /api/events', () => {
  test('rol user → 403', async () => {
    const user = await crearUsuarioConRol('user');
    const res = await request(app).post(EVENTS).set('Cookie', user.cookie).send(eventoValido);
    assert.equal(res.status, 403);
    assert.deepEqual(res.body, { status: 'error', message: 'No tienes permisos para realizar esta acción' });
    assert.equal(await Event.countDocuments(), 0, 'no se creó nada');
  });

  test('rol organizer → 201 con el evento y organizer = id de la sesión', async () => {
    const organizer = await crearUsuarioConRol('organizer');
    const res = await request(app).post(EVENTS).set('Cookie', organizer.cookie).send(eventoValido);

    assert.equal(res.status, 201);
    assert.equal(res.body.status, 'success');
    const { payload } = res.body;
    assert.equal(typeof payload.id, 'string');
    assert.equal(payload.title, eventoValido.title);
    assert.equal(payload.organizer, organizer.id);
    assert.equal(payload.status, 'draft');
    assert.equal(payload.capacity, 12);
    assert.equal(payload.price, 15000);
    assert.equal(new Date(payload.date).toISOString(), eventoValido.date);
    assert.equal('_id' in payload, false);
    assert.equal('__v' in payload, false);
  });

  test('rol admin → 201', async () => {
    const admin = await crearUsuarioConRol('admin');
    const res = await request(app).post(EVENTS).set('Cookie', admin.cookie).send(eventoValido);
    assert.equal(res.status, 201);
    assert.equal(res.body.payload.organizer, admin.id);
  });

  test('ignora organizer y status enviados en el body', async () => {
    const organizer = await crearUsuarioConRol('organizer');
    const payload = await crearEventoComo(organizer, {
      ...eventoValido,
      organizer: '665f2a1b2c3d4e5f6a7b8c9d',
      status: 'published',
    });
    assert.equal(payload.organizer, organizer.id);
    assert.equal(payload.status, 'draft');
  });

  test('400 si faltan campos obligatorios', async () => {
    const organizer = await crearUsuarioConRol('organizer');
    const res = await request(app).post(EVENTS).set('Cookie', organizer.cookie).send({ title: 'Sin datos' });
    assert.equal(res.status, 400);
    assert.equal(res.body.message, 'Faltan campos obligatorios: description, category, date, location, capacity');
  });

  test('400 si los valores no son válidos (fecha, cupo, precio)', async () => {
    const organizer = await crearUsuarioConRol('organizer');
    const casos = [
      [{ date: 'mañana' }, 'El campo date debe ser una fecha válida en formato ISO 8601'],
      [{ date: 0 }, 'El campo date debe ser una fecha válida en formato ISO 8601'],
      [{ date: 1700000000000 }, 'El campo date debe ser una fecha válida en formato ISO 8601'],
      [{ date: null }, 'El campo date debe ser una fecha válida en formato ISO 8601'],
      [{ date: true }, 'El campo date debe ser una fecha válida en formato ISO 8601'],
      // Date.parse los aceptaría: "1" como el año 2001, "2027-02-30" como el 2 de marzo
      [{ date: '1' }, 'El campo date debe ser una fecha válida en formato ISO 8601'],
      [{ date: 'March 7, 2027' }, 'El campo date debe ser una fecha válida en formato ISO 8601'],
      [{ date: '2027-02-30' }, 'El campo date debe ser una fecha válida en formato ISO 8601'],
      [{ date: '2027-13-01' }, 'El campo date debe ser una fecha válida en formato ISO 8601'],
      [{ date: '2027-03-15T24:00:00Z' }, 'El campo date debe ser una fecha válida en formato ISO 8601'],
      [{ capacity: 0 }, 'El campo capacity debe ser un entero mayor que 0'],
      [{ capacity: '12' }, 'El campo capacity debe ser un entero mayor que 0'],
      [{ price: -1 }, 'El campo price debe ser un número mayor o igual a 0'],
      [{ title: '   ' }, 'El campo title debe ser un texto no vacío'],
    ];
    for (const [cambio, mensaje] of casos) {
      const res = await request(app).post(EVENTS).set('Cookie', organizer.cookie).send({ ...eventoValido, ...cambio });
      assert.equal(res.status, 400, JSON.stringify(cambio));
      assert.equal(res.body.message, mensaje);
    }
  });
});

describe('Formatos de fecha aceptados', () => {
  test('solo día, con hora sin zona y con zona explícita → 201', async () => {
    const organizer = await crearUsuarioConRol('organizer');
    // Sin zona horaria se interpreta como UTC (como la forma solo-día), no como hora local del servidor
    const casos = [
      ['2027-03-15', '2027-03-15T00:00:00.000Z'],
      ['2027-03-15T19:00:00', '2027-03-15T19:00:00.000Z'],
      ['2027-03-15T19:00:00.000Z', '2027-03-15T19:00:00.000Z'],
      ['2027-03-15T19:00:00-03:00', '2027-03-15T22:00:00.000Z'],
    ];
    for (const [date, esperado] of casos) {
      const res = await request(app).post(EVENTS).set('Cookie', organizer.cookie).send({ ...eventoValido, date });
      assert.equal(res.status, 201, date);
      assert.equal(res.body.payload.date, esperado, date);
    }
  });
});

describe('GET /api/events (consulta pública)', () => {
  test('lista los eventos creados sin necesidad de sesión', async () => {
    const organizer = await crearUsuarioConRol('organizer');
    await crearEventoComo(organizer);
    await crearEventoComo(organizer, { ...eventoValido, title: 'Taller de latte art', date: '2027-04-01T18:00:00.000Z' });

    const res = await request(app).get(EVENTS);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 2);
    assert.deepEqual(res.body.data.map((e) => e.title), ['Cata de cafés de Colombia', 'Taller de latte art']);
  });

  test('detalle por id sin sesión → 200', async () => {
    const organizer = await crearUsuarioConRol('organizer');
    const creado = await crearEventoComo(organizer);
    const res = await request(app).get(`${EVENTS}/${creado.id}`);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.payload, creado);
  });
});

describe('PUT /api/events/:eid (propiedad del recurso)', () => {
  test('el organizer dueño modifica su evento → 200', async () => {
    const organizer = await crearUsuarioConRol('organizer');
    const creado = await crearEventoComo(organizer);

    const res = await request(app)
      .put(`${EVENTS}/${creado.id}`)
      .set('Cookie', organizer.cookie)
      .send({ title: 'Cata de cafés de Etiopía', capacity: 10 });

    assert.equal(res.status, 200);
    assert.equal(res.body.payload.title, 'Cata de cafés de Etiopía');
    assert.equal(res.body.payload.capacity, 10);
    assert.equal(res.body.payload.location, eventoValido.location, 'los campos no enviados se conservan');
    assert.equal(res.body.payload.organizer, organizer.id);
  });

  test('otro organizer intenta modificar un evento ajeno → 403 y el evento no cambia', async () => {
    const duenio = await crearUsuarioConRol('organizer', 'duenio@mail.com');
    const intruso = await crearUsuarioConRol('organizer', 'intruso@mail.com');
    const creado = await crearEventoComo(duenio);

    const res = await request(app)
      .put(`${EVENTS}/${creado.id}`)
      .set('Cookie', intruso.cookie)
      .send({ title: 'Hackeado' });

    assert.equal(res.status, 403);
    assert.deepEqual(res.body, { status: 'error', message: 'Solo puedes modificar tus propios eventos' });
    const enBase = await Event.findById(creado.id).lean();
    assert.equal(enBase.title, eventoValido.title);
  });

  test('admin modifica un evento ajeno → 200 y el organizer original se conserva', async () => {
    const organizer = await crearUsuarioConRol('organizer');
    const admin = await crearUsuarioConRol('admin');
    const creado = await crearEventoComo(organizer);

    const res = await request(app)
      .put(`${EVENTS}/${creado.id}`)
      .set('Cookie', admin.cookie)
      .send({ price: 0, organizer: admin.id });

    assert.equal(res.status, 200);
    assert.equal(res.body.payload.price, 0);
    assert.equal(res.body.payload.organizer, organizer.id, 'organizer no se modifica desde el body');
  });

  test('evento inexistente → 404; id con formato inválido → 400', async () => {
    const admin = await crearUsuarioConRol('admin');
    const inexistente = await request(app).put(`${EVENTS}/665f2a1b2c3d4e5f6a7b8c9d`).set('Cookie', admin.cookie).send({ title: 'X' });
    assert.equal(inexistente.status, 404);
    const invalido = await request(app).put(`${EVENTS}/abc`).set('Cookie', admin.cookie).send({ title: 'X' });
    assert.equal(invalido.status, 400);
  });

  test('sin campos modificables → 400', async () => {
    const organizer = await crearUsuarioConRol('organizer');
    const creado = await crearEventoComo(organizer);
    const res = await request(app).put(`${EVENTS}/${creado.id}`).set('Cookie', organizer.cookie).send({ status: 'cancelled' });
    assert.equal(res.status, 400);
    assert.equal(res.body.message, 'No se enviaron campos modificables');
  });

  test('un organizer no puede modificar ni su propio evento con datos inválidos', async () => {
    const organizer = await crearUsuarioConRol('organizer');
    const creado = await crearEventoComo(organizer);
    const res = await request(app).put(`${EVENTS}/${creado.id}`).set('Cookie', organizer.cookie).send({ capacity: -5 });
    assert.equal(res.status, 400);
    const fecha = await request(app).put(`${EVENTS}/${creado.id}`).set('Cookie', organizer.cookie).send({ date: 0 });
    assert.equal(fecha.status, 400);
    assert.equal(fecha.body.message, 'El campo date debe ser una fecha válida en formato ISO 8601');
  });

  test('si el evento desaparece entre la lectura y la escritura → 404, no 200 con payload null', async () => {
    let lecturas = 0;
    const repositorioQueBorra = {
      // primera lectura: existe; segunda (tras fallar la escritura): ya no
      getById: async () => (lecturas++ === 0 ? { id: 'x', organizer: 'org-1', status: 'draft' } : null),
      actualizarSiModificable: async () => null,
      cambiarEstado: async () => null,
    };
    const service = new EventsService(repositorioQueBorra);
    await assert.rejects(
      service.actualizar('x', { title: 'Nuevo' }, { id: 'org-1', role: 'organizer' }),
      (error) => error.status === 404
    );
  });
});

describe('Errores del parser de body', () => {
  test('body mayor al límite → 413, no 500', async () => {
    const organizer = await crearUsuarioConRol('organizer');
    const res = await request(app)
      .post(EVENTS)
      .set('Cookie', organizer.cookie)
      .send({ ...eventoValido, description: 'x'.repeat(150 * 1024) });
    assert.equal(res.status, 413);
    assert.deepEqual(res.body, { status: 'error', message: 'El cuerpo de la petición es demasiado grande' });
  });
});
