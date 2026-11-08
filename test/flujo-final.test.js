import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.js';
import Event from '../src/models/Event.js';
import { transporter } from '../src/config/mail.config.js';
import { iniciarBaseDePrueba, limpiarBaseDePrueba, detenerBaseDePrueba } from './setup.js';
import { crearUsuarioConRol, crearEventoPublicado, eventoValido } from './helpers.js';

// Los 10 casos del "Flujo completo a verificar antes de entregar" de la entrega final, uno a uno.

before(iniciarBaseDePrueba);
after(detenerBaseDePrueba);
beforeEach(limpiarBaseDePrueba);

const enviados = [];
const sendMailOriginal = transporter.sendMail.bind(transporter);
transporter.sendMail = async (mensaje) => { enviados.push(mensaje); return sendMailOriginal(mensaje); };
beforeEach(() => { enviados.length = 0; });

const EVENTS = '/api/events';
const inscribir = (eventId, usuario, body = {}) => request(app).post(`${EVENTS}/${eventId}/tickets`).set('Cookie', usuario.cookie).send(body);

describe('Flujo completo a verificar (entrega final)', () => {
  test('1. Registro → login → /current → logout → /current devuelve 401', async () => {
    const registro = await request(app).post('/api/sessions/register').send({ first_name: 'Carla', last_name: 'Cliente', email: 'carla@mail.com', password: 'Aurora2026!' });
    assert.equal(registro.status, 201);
    assert.equal(registro.body.payload.role, 'user', 'rol por defecto');

    const login = await request(app).post('/api/sessions/login').send({ email: 'carla@mail.com', password: 'Aurora2026!' });
    assert.equal(login.status, 200);
    assert.deepEqual(login.body, { status: 'success', message: 'Login correcto' });
    const setCookie = login.headers['set-cookie'].find((c) => c.startsWith('currentUser='));
    assert.match(setCookie, /HttpOnly/i);
    const cookie = setCookie.split(';')[0];

    const current = await request(app).get('/api/sessions/current').set('Cookie', cookie);
    assert.equal(current.status, 200);
    assert.deepEqual(Object.keys(current.body.payload).sort(), ['email', 'id', 'role']);

    const logout = await request(app).post('/api/sessions/logout').set('Cookie', cookie);
    assert.deepEqual(logout.body, { status: 'success', message: 'Sesión cerrada' });
    const borrada = logout.headers['set-cookie'].find((c) => c.startsWith('currentUser='));
    assert.match(borrada, /currentUser=;/);

    const sinSesion = await request(app).get('/api/sessions/current');
    assert.deepEqual([sinSesion.status, sinSesion.body], [401, { status: 'error', message: 'No autenticado' }]);
  });

  test('2. user intenta crear evento → 403', async () => {
    const user = await crearUsuarioConRol('user');
    const res = await request(app).post(EVENTS).set('Cookie', user.cookie).send(eventoValido);
    assert.deepEqual([res.status, res.body], [403, { status: 'error', message: 'No tienes permisos para realizar esta acción' }]);
  });

  test('3. organizer crea evento → user se inscribe → email → cupo descontado', async () => {
    const organizer = await crearUsuarioConRol('organizer');
    const user = await crearUsuarioConRol('user', 'carla@mail.com');
    const evento = await crearEventoPublicado(organizer, { capacity: 10 });

    const res = await inscribir(evento.id, user, { quantity: 3 });
    assert.equal(res.status, 201);
    assert.equal(res.body.payload.status, 'confirmed');
    assert.equal(enviados.length, 1);
    assert.equal(enviados[0].to, 'carla@mail.com');
    assert.match(enviados[0].subject, /Inscripción confirmada/);

    const inscritos = await request(app).get(`${EVENTS}/${evento.id}/tickets`).set('Cookie', organizer.cookie);
    assert.equal(inscritos.body.payload.cuposOcupados, 3);
    assert.equal(inscritos.body.payload.cuposDisponibles, 7);
  });

  test('4. user intenta inscribirse nuevamente al mismo evento → error de duplicado', async () => {
    const organizer = await crearUsuarioConRol('organizer');
    const user = await crearUsuarioConRol('user');
    const evento = await crearEventoPublicado(organizer);
    const primera = await inscribir(evento.id, user);
    const segunda = await inscribir(evento.id, user);
    assert.equal(segunda.status, 409);
    assert.equal(segunda.body.message, `Ya tienes una inscripción activa para este evento (código ${primera.body.payload.reservationCode})`);
  });

  test('5. user intenta inscribirse a evento sin cupo → error claro', async () => {
    const organizer = await crearUsuarioConRol('organizer');
    const ana = await crearUsuarioConRol('user', 'ana@mail.com');
    const bruno = await crearUsuarioConRol('user', 'bruno@mail.com');
    const evento = await crearEventoPublicado(organizer, { capacity: 2 });
    assert.equal((await inscribir(evento.id, ana, { quantity: 2 })).status, 201);

    const lleno = await inscribir(evento.id, bruno);
    assert.deepEqual([lleno.status, lleno.body], [409, { status: 'error', message: 'El evento no tiene cupos disponibles' }]);

    const otro = await crearEventoPublicado(organizer, { title: 'Otro', capacity: 3 });
    await inscribir(otro.id, ana, { quantity: 2 });
    const insuficiente = await inscribir(otro.id, bruno, { quantity: 2 });
    assert.deepEqual([insuficiente.status, insuficiente.body], [409, { status: 'error', message: 'No hay cupo suficiente: quedan 1 lugares y solicitaste 2' }]);
  });

  test('6. user cancela su ticket → cupo liberado → nueva inscripción funciona', async () => {
    const organizer = await crearUsuarioConRol('organizer');
    const ana = await crearUsuarioConRol('user', 'ana@mail.com');
    const bruno = await crearUsuarioConRol('user', 'bruno@mail.com');
    const evento = await crearEventoPublicado(organizer, { capacity: 1 });
    const ticket = (await inscribir(evento.id, ana)).body.payload;
    assert.equal((await inscribir(evento.id, bruno)).status, 409);

    const cancelado = await request(app).patch(`/api/tickets/${ticket.id}/cancel`).set('Cookie', ana.cookie);
    assert.equal(cancelado.status, 200);
    assert.equal(cancelado.body.payload.status, 'cancelled');
    assert.ok(cancelado.body.payload.cancelledAt);

    const nueva = await inscribir(evento.id, bruno);
    assert.equal(nueva.status, 201);
    const inscritos = await request(app).get(`${EVENTS}/${evento.id}/tickets`).set('Cookie', organizer.cookie);
    assert.equal(inscritos.body.payload.cuposDisponibles, 0);
    assert.equal(inscritos.body.payload.tickets.length, 2, 'el cancelado sigue como historial');
  });

  test('7. organizer intenta modificar evento ajeno → 403', async () => {
    const duenio = await crearUsuarioConRol('organizer', 'duenio@mail.com');
    const otro = await crearUsuarioConRol('organizer', 'otro@mail.com');
    const evento = await crearEventoPublicado(duenio);
    const put = await request(app).put(`${EVENTS}/${evento.id}`).set('Cookie', otro.cookie).send({ title: 'Otro' });
    assert.deepEqual([put.status, put.body], [403, { status: 'error', message: 'Solo puedes modificar tus propios eventos' }]);
    const status = await request(app).patch(`${EVENTS}/${evento.id}/status`).set('Cookie', otro.cookie).send({ status: 'cancelled' });
    assert.equal(status.status, 403);
  });

  test('8. admin modifica evento de otro organizador → éxito', async () => {
    const organizer = await crearUsuarioConRol('organizer');
    const admin = await crearUsuarioConRol('admin');
    const evento = await crearEventoPublicado(organizer);
    const res = await request(app).put(`${EVENTS}/${evento.id}`).set('Cookie', admin.cookie).send({ capacity: 50 });
    assert.equal(res.status, 200);
    assert.equal(res.body.payload.capacity, 50);
    assert.equal(res.body.payload.organizer, organizer.id, 'el organizador no cambia');
    const cancelar = await request(app).patch(`${EVENTS}/${evento.id}/status`).set('Cookie', admin.cookie).send({ status: 'cancelled' });
    assert.equal(cancelar.body.payload.status, 'cancelled');
    assert.equal(await Event.countDocuments({ _id: evento.id }), 1, 'cancelar no borra');
  });

  test('9. Respuestas de usuario, evento y ticket no contienen password', async () => {
    const organizer = await crearUsuarioConRol('organizer');
    const user = await crearUsuarioConRol('user');
    const admin = await crearUsuarioConRol('admin');
    const evento = await crearEventoPublicado(organizer);
    await inscribir(evento.id, user);
    const respuestas = [
      await request(app).get('/api/sessions/current').set('Cookie', user.cookie),
      await request(app).get('/api/users').set('Cookie', admin.cookie),
      await request(app).get(`${EVENTS}/${evento.id}`),
      await request(app).get(EVENTS),
      await request(app).get('/api/tickets/my-tickets').set('Cookie', user.cookie),
      await request(app).get(`${EVENTS}/${evento.id}/tickets`).set('Cookie', organizer.cookie),
    ];
    for (const res of respuestas) {
      assert.equal(res.status, 200);
      const texto = JSON.stringify(res.body);
      assert.equal(/password/i.test(texto), false);
      assert.equal(texto.includes('$2b$'), false);
    }
  });

  test('10. Listado con ?status=published&page=2&limit=5 devuelve la estructura paginada', async () => {
    const organizer = await crearUsuarioConRol('organizer');
    for (let i = 1; i <= 7; i++) {
      await crearEventoPublicado(organizer, { title: `Evento ${i}`, date: `2027-0${Math.min(i, 9)}-10T19:00:00.000Z` });
    }
    await request(app).post(EVENTS).set('Cookie', organizer.cookie).send({ ...eventoValido, title: 'Borrador' });

    const res = await request(app).get(`${EVENTS}?status=published&page=2&limit=5`);
    assert.equal(res.status, 200);
    assert.deepEqual(Object.keys(res.body).sort(), ['data', 'limit', 'page', 'status', 'total', 'totalPages']);
    assert.equal(res.body.page, 2);
    assert.equal(res.body.limit, 5);
    assert.equal(res.body.total, 7, 'el borrador no cuenta');
    assert.equal(res.body.totalPages, 2);
    assert.deepEqual(res.body.data.map((e) => e.title), ['Evento 6', 'Evento 7']);
    assert.ok(res.body.data.every((e) => e.status === 'published'));
  });
});
