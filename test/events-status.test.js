import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.js';
import Event from '../src/models/Event.js';
import EventsService from '../src/services/events.service.js';
import { EVENT_STATUSES, TRANSICIONES, ESTADOS_FINALES, puedeTransicionar, esEstadoValido } from '../src/config/events.config.js';
import { iniciarBaseDePrueba, limpiarBaseDePrueba, detenerBaseDePrueba } from './setup.js';
import { crearUsuarioConRol, eventoValido } from './helpers.js';

// PATCH /api/events/:eid/status: máquina de estados draft → published → finished,
// cancelar desde draft o published, estados finales inmutables, propiedad del recurso.

const EVENTS = '/api/events';

before(iniciarBaseDePrueba);
after(detenerBaseDePrueba);
beforeEach(limpiarBaseDePrueba);

async function crearEventoComo(usuario, datos = eventoValido) {
  const res = await request(app).post(EVENTS).set('Cookie', usuario.cookie).send(datos);
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.payload;
}

const cambiarEstado = (id, usuario, body) =>
  request(app).patch(`${EVENTS}/${id}/status`).set('Cookie', usuario.cookie).send(body);

describe('Tabla de transiciones', () => {
  test('define los cuatro estados de la consigna y es inmutable', () => {
    assert.deepEqual(EVENT_STATUSES, ['draft', 'published', 'cancelled', 'finished']);
    assert.ok(Object.isFrozen(TRANSICIONES));
    assert.throws(() => { TRANSICIONES.cancelled.push('draft'); }, TypeError);
    assert.deepEqual(ESTADOS_FINALES, ['cancelled', 'finished']);
  });

  test('puedeTransicionar y esEstadoValido', () => {
    assert.equal(puedeTransicionar('draft', 'published'), true);
    assert.equal(puedeTransicionar('draft', 'cancelled'), true);
    assert.equal(puedeTransicionar('published', 'finished'), true);
    assert.equal(puedeTransicionar('published', 'cancelled'), true);
    assert.equal(puedeTransicionar('draft', 'finished'), false);
    assert.equal(puedeTransicionar('published', 'draft'), false);
    assert.equal(puedeTransicionar('cancelled', 'published'), false);
    assert.equal(puedeTransicionar('finished', 'cancelled'), false);
    assert.equal(puedeTransicionar('inexistente', 'draft'), false);
    assert.equal(esEstadoValido('published'), true);
    assert.equal(esEstadoValido('PUBLISHED'), false);
    assert.equal(esEstadoValido(null), false);
  });
});

describe('PATCH /api/events/:eid/status (flujo normal)', () => {
  test('el organizer dueño publica su borrador → 200 published', async () => {
    const organizer = await crearUsuarioConRol('organizer');
    const creado = await crearEventoComo(organizer);
    const res = await cambiarEstado(creado.id, organizer, { status: 'published' });
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'success');
    assert.equal(res.body.payload.status, 'published');
    assert.equal(res.body.payload.id, creado.id);
    assert.equal(res.body.payload.organizer, organizer.id);
  });

  test('cancelar = status cancelled; el documento sigue en la base', async () => {
    const organizer = await crearUsuarioConRol('organizer');
    const creado = await crearEventoComo(organizer);
    const res = await cambiarEstado(creado.id, organizer, { status: 'cancelled' });
    assert.equal(res.status, 200);
    assert.equal(res.body.payload.status, 'cancelled');
    assert.equal(await Event.countDocuments({ _id: creado.id }), 1, 'no se elimina físicamente');
    const detalle = await request(app).get(`${EVENTS}/${creado.id}`);
    assert.equal(detalle.status, 200);
    assert.equal(detalle.body.payload.status, 'cancelled');
  });

  test('draft → published → finished', async () => {
    const organizer = await crearUsuarioConRol('organizer');
    const creado = await crearEventoComo(organizer);
    assert.equal((await cambiarEstado(creado.id, organizer, { status: 'published' })).status, 200);
    const fin = await cambiarEstado(creado.id, organizer, { status: 'finished' });
    assert.equal(fin.status, 200);
    assert.equal(fin.body.payload.status, 'finished');
  });

  test('admin cambia el estado de un evento ajeno → 200', async () => {
    const organizer = await crearUsuarioConRol('organizer');
    const admin = await crearUsuarioConRol('admin');
    const creado = await crearEventoComo(organizer);
    const res = await cambiarEstado(creado.id, admin, { status: 'published' });
    assert.equal(res.status, 200);
    assert.equal(res.body.payload.organizer, organizer.id);
  });

  test('el body solo puede traer status: otros campos se ignoran', async () => {
    const organizer = await crearUsuarioConRol('organizer');
    const creado = await crearEventoComo(organizer);
    const res = await cambiarEstado(creado.id, organizer, { status: 'published', title: 'Hackeado', organizer: '665f2a1b2c3d4e5f6a7b8c9d' });
    assert.equal(res.status, 200);
    assert.equal(res.body.payload.title, eventoValido.title);
    assert.equal(res.body.payload.organizer, organizer.id);
  });
});

describe('PATCH /api/events/:eid/status (errores)', () => {
  test('cambiar el estado de un evento cancelado → 409', async () => {
    const organizer = await crearUsuarioConRol('organizer');
    const creado = await crearEventoComo(organizer);
    await cambiarEstado(creado.id, organizer, { status: 'cancelled' });
    for (const status of ['draft', 'published', 'finished']) {
      const res = await cambiarEstado(creado.id, organizer, { status });
      assert.equal(res.status, 409, status);
      assert.deepEqual(res.body, { status: 'error', message: 'El evento está cancelado y no admite modificaciones' });
    }
  });

  test('un evento finalizado tampoco cambia → 409', async () => {
    const organizer = await crearUsuarioConRol('organizer');
    const creado = await crearEventoComo(organizer);
    await Event.updateOne({ _id: creado.id }, { status: 'finished' });
    const res = await cambiarEstado(creado.id, organizer, { status: 'cancelled' });
    assert.equal(res.status, 409);
    assert.equal(res.body.message, 'El evento ya finalizó y no admite modificaciones');
  });

  test('transiciones no permitidas → 409 con el detalle', async () => {
    const organizer = await crearUsuarioConRol('organizer');
    const creado = await crearEventoComo(organizer);
    const directo = await cambiarEstado(creado.id, organizer, { status: 'finished' });
    assert.equal(directo.status, 409);
    assert.equal(directo.body.message, 'No se puede pasar un evento de draft a finished');

    await cambiarEstado(creado.id, organizer, { status: 'published' });
    const atras = await cambiarEstado(creado.id, organizer, { status: 'draft' });
    assert.equal(atras.status, 409);
    assert.equal(atras.body.message, 'No se puede pasar un evento de published a draft');
  });

  test('repetir el estado actual → 409', async () => {
    const organizer = await crearUsuarioConRol('organizer');
    const creado = await crearEventoComo(organizer);
    const res = await cambiarEstado(creado.id, organizer, { status: 'draft' });
    assert.equal(res.status, 409);
    assert.equal(res.body.message, 'El evento ya está en estado draft');
  });

  test('publicar un evento cuya fecha ya pasó → 409', async () => {
    const organizer = await crearUsuarioConRol('organizer');
    const creado = await crearEventoComo(organizer);
    // El evento se creó con fecha futura; se "envejece" directamente en la base
    await Event.updateOne({ _id: creado.id }, { date: new Date('2020-01-01') });
    const res = await cambiarEstado(creado.id, organizer, { status: 'published' });
    assert.equal(res.status, 409);
    assert.equal(res.body.message, 'No se puede publicar un evento cuya fecha ya pasó');
    // Cancelarlo sí se puede
    const cancelado = await cambiarEstado(creado.id, organizer, { status: 'cancelled' });
    assert.equal(cancelado.status, 200);
  });

  test('status ausente o inválido → 400', async () => {
    const organizer = await crearUsuarioConRol('organizer');
    const creado = await crearEventoComo(organizer);
    const casos = [
      [{}, 'Falta el campo obligatorio: status'],
      [{ status: 'PUBLISHED' }, 'El campo status debe ser uno de: draft, published, cancelled, finished'],
      [{ status: 'eliminado' }, 'El campo status debe ser uno de: draft, published, cancelled, finished'],
      [{ status: null }, 'El campo status debe ser uno de: draft, published, cancelled, finished'],
      [{ status: 1 }, 'El campo status debe ser uno de: draft, published, cancelled, finished'],
      [{ status: ['published'] }, 'El campo status debe ser uno de: draft, published, cancelled, finished'],
    ];
    for (const [body, mensaje] of casos) {
      const res = await cambiarEstado(creado.id, organizer, body);
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.equal(res.body.message, mensaje);
    }
    const enBase = await Event.findById(creado.id).lean();
    assert.equal(enBase.status, 'draft');
  });

  test('otro organizer → 403 y el estado no cambia', async () => {
    const duenio = await crearUsuarioConRol('organizer', 'duenio@mail.com');
    const intruso = await crearUsuarioConRol('organizer', 'intruso@mail.com');
    const creado = await crearEventoComo(duenio);
    const res = await cambiarEstado(creado.id, intruso, { status: 'cancelled' });
    assert.equal(res.status, 403);
    assert.deepEqual(res.body, { status: 'error', message: 'Solo puedes modificar tus propios eventos' });
    assert.equal((await Event.findById(creado.id).lean()).status, 'draft');
  });

  test('rol user → 403; sin sesión → 401', async () => {
    const organizer = await crearUsuarioConRol('organizer');
    const user = await crearUsuarioConRol('user');
    const creado = await crearEventoComo(organizer);
    const conUser = await cambiarEstado(creado.id, user, { status: 'cancelled' });
    assert.equal(conUser.status, 403);
    const sinSesion = await request(app).patch(`${EVENTS}/${creado.id}/status`).send({ status: 'cancelled' });
    assert.equal(sinSesion.status, 401);
  });

  test('evento inexistente → 404; id inválido → 400; id en mayúsculas se trata igual', async () => {
    const admin = await crearUsuarioConRol('admin');
    const inexistente = await cambiarEstado('665f2a1b2c3d4e5f6a7b8c9d', admin, { status: 'published' });
    assert.equal(inexistente.status, 404);
    const invalido = await cambiarEstado('abc', admin, { status: 'published' });
    assert.equal(invalido.status, 400);
    assert.equal(invalido.body.message, 'El identificador enviado no es válido');
    const organizer = await crearUsuarioConRol('organizer');
    const creado = await crearEventoComo(organizer);
    const mayusculas = await cambiarEstado(creado.id.toUpperCase(), organizer, { status: 'published' });
    assert.equal(mayusculas.status, 200);
  });

  test('la escritura exige el estado leído: si cambió en el medio → 409, si desapareció → 404', async () => {
    const usuario = { id: 'org-1', role: 'organizer' };
    let transicion = null;
    let lecturas = 0;
    const cambiado = {
      getById: async () => ({ id: 'x', organizer: 'org-1', status: lecturas++ === 0 ? 'draft' : 'published', date: '2030-01-01' }),
      cambiarEstado: async (id, desde, hacia) => { transicion = [desde, hacia]; return null; },
    };
    await assert.rejects(new EventsService(cambiado).cambiarEstado('x', { status: 'published' }, usuario), {
      status: 409,
      message: 'El evento cambió a estado published mientras se procesaba la petición',
    });
    assert.deepEqual(transicion, ['draft', 'published'], 'la transición se condiciona al estado leído');

    lecturas = 0;
    const borrado = {
      getById: async () => (lecturas++ === 0 ? { id: 'x', organizer: 'org-1', status: 'draft', date: '2030-01-01' } : null),
      actualizarSiModificable: async () => null,
      cambiarEstado: async () => null,
    };
    await assert.rejects(new EventsService(borrado).cambiarEstado('x', { status: 'cancelled' }, usuario), { status: 404 });
  });
});
