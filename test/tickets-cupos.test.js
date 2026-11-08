import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.js';
import Ticket from '../src/models/Ticket.js';
import TicketsService from '../src/services/tickets.service.js';
import { ESTADOS_ACTIVOS, TICKET_STATUSES } from '../src/config/tickets.config.js';
import { generarCodigoReserva, RESERVATION_CODE_REGEX } from '../src/utils/reservationCode.util.js';
import { iniciarBaseDePrueba, limpiarBaseDePrueba, detenerBaseDePrueba } from './setup.js';
import { crearUsuarioConRol, crearEventoPublicado } from './helpers.js';

// Control de cupos (incluida concurrencia), consultas GET /api/tickets/my-tickets y
// GET /api/events/:eid/tickets, y utilidades.

before(iniciarBaseDePrueba);
after(detenerBaseDePrueba);
beforeEach(limpiarBaseDePrueba);

const inscribir = (eventId, usuario, body = {}) =>
  request(app).post(`/api/events/${eventId}/tickets`).set('Cookie', usuario.cookie).send(body);

async function crearUsuarios(cantidad, prefijo = 'u') {
  const usuarios = [];
  for (let i = 0; i < cantidad; i++) usuarios.push(await crearUsuarioConRol('user', `${prefijo}${i}@mail.com`));
  return usuarios;
}

describe('Control de cupos', () => {
  test('nunca se confirman más lugares que la capacidad; los cancelados no cuentan', async () => {
    const organizer = await crearUsuarioConRol('organizer');
    const evento = await crearEventoPublicado(organizer, { capacity: 5 });
    const [a, b, c, d] = await crearUsuarios(4);

    assert.equal((await inscribir(evento.id, a, { quantity: 2 })).status, 201); // 2/5
    assert.equal((await inscribir(evento.id, b, { quantity: 2 })).status, 201); // 4/5
    const sinCupo = await inscribir(evento.id, c, { quantity: 2 });            // 6 > 5
    assert.equal(sinCupo.status, 409);
    assert.equal(sinCupo.body.message, 'No hay cupo suficiente: quedan 1 lugares y solicitaste 2');
    assert.equal((await inscribir(evento.id, c, { quantity: 1 })).status, 201); // 5/5
    const lleno = await inscribir(evento.id, d);
    assert.equal(lleno.status, 409);
    assert.equal(lleno.body.message, 'El evento no tiene cupos disponibles');

    // Cancelar los 2 de "a" libera 2 lugares
    const ticketA = await Ticket.findOne({ user: a.id }).lean();
    await request(app).patch(`/api/tickets/${ticketA._id}/cancel`).set('Cookie', a.cookie);
    assert.equal((await inscribir(evento.id, d, { quantity: 2 })).status, 201);

    const activos = await Ticket.find({ event: evento.id, status: { $in: ESTADOS_ACTIVOS } }).lean();
    assert.equal(activos.reduce((suma, t) => suma + t.quantity, 0), 5);
  });

  test('inscripciones simultáneas al último cupo: solo una se confirma, sin sobreventa', async () => {
    const organizer = await crearUsuarioConRol('organizer');
    const evento = await crearEventoPublicado(organizer, { capacity: 3 });
    const usuarios = await crearUsuarios(8, 'c');

    const respuestas = await Promise.all(usuarios.map((u) => inscribir(evento.id, u)));
    const creados = respuestas.filter((r) => r.status === 201);
    const rechazados = respuestas.filter((r) => r.status === 409);
    assert.equal(creados.length, 3, 'exactamente la capacidad');
    assert.equal(rechazados.length, 5);
    assert.ok(rechazados.every((r) => /cupo/.test(r.body.message)));
    assert.equal(await Ticket.countDocuments({ event: evento.id }), 3, 'las reservas deshechas no quedan en la base');
  });

  test('el servicio deshace solo la reserva más reciente cuando el recuento supera la capacidad', async () => {
    const eliminados = [];
    let recuentos = 0;
    const tickets = {
      findActiveByUserAndEvent: async () => null,
      // antes de crear: 0 ocupados; después, el recuento "hasta mi ticket" ya ve 2 (otro se coló)
      contarCuposOcupados: async () => (recuentos++ === 0 ? 0 : 2),
      create: async (datos) => ({ id: 't-2', ...datos }),
      removeById: async (id) => { eliminados.push(id); },
    };
    const events = { getById: async () => ({ id: 'e1', title: 'T', date: '2030-01-01', location: 'L', status: 'published', capacity: 1, organizer: 'o' }) };
    const mail = { enviarConfirmacionInscripcion: async () => true };
    const service = new TicketsService(tickets, events, {}, mail);
    await assert.rejects(service.inscribir('e1', {}, { id: 'u1', email: 'u@x.com', role: 'user' }), {
      status: 409,
      message: 'El evento no tiene cupos disponibles',
    });
    assert.deepEqual(eliminados, ['t-2']);
  });

  test('el correo se envía solo después de persistir y no bloquea la respuesta', async () => {
    const orden = [];
    const tickets = {
      findActiveByUserAndEvent: async () => null,
      contarCuposOcupados: async () => 0,
      create: async (datos) => { orden.push('persistido'); return { id: 't1', ...datos }; },
      removeById: async () => {},
    };
    const events = { getById: async () => ({ id: 'e1', title: 'T', date: '2030-01-01', location: 'L', status: 'published', capacity: 10, organizer: 'o' }) };
    let destinatario = null;
    const mail = { enviarConfirmacionInscripcion: async ({ destinatario: d }) => { orden.push('correo'); destinatario = d; return true; } };
    const ticket = await new TicketsService(tickets, events, {}, mail).inscribir('e1', { quantity: 2 }, { id: 'u1', email: 'ana@mail.com', role: 'user' });
    assert.deepEqual(orden, ['persistido', 'correo']);
    assert.equal(destinatario, 'ana@mail.com');
    assert.equal(ticket.quantity, 2);
    assert.match(ticket.reservationCode, RESERVATION_CODE_REGEX);
  });

  test('códigos de reserva: formato legible y sin repetidos en 1000 generaciones', () => {
    const codigos = new Set(Array.from({ length: 1000 }, generarCodigoReserva));
    assert.equal(codigos.size, 1000);
    for (const codigo of codigos) assert.match(codigo, RESERVATION_CODE_REGEX);
    assert.doesNotMatch([...codigos].join(''), /[0O1IL]/, 'sin caracteres ambiguos');
  });

  test('la configuración de estados es la de la consigna y está congelada', () => {
    assert.deepEqual(TICKET_STATUSES, ['confirmed', 'pending', 'cancelled']);
    assert.deepEqual(ESTADOS_ACTIVOS, ['confirmed', 'pending']);
    assert.throws(() => { ESTADOS_ACTIVOS.push('cancelled'); }, TypeError);
  });
});

describe('GET /api/tickets/my-tickets', () => {
  test('devuelve solo los tickets del usuario, con el evento poblado (title, date, location)', async () => {
    const organizer = await crearUsuarioConRol('organizer');
    const ana = await crearUsuarioConRol('user', 'ana@mail.com');
    const bruno = await crearUsuarioConRol('user', 'bruno@mail.com');
    const cata = await crearEventoPublicado(organizer, { title: 'Cata', date: '2027-03-15T19:00:00.000Z' });
    const taller = await crearEventoPublicado(organizer, { title: 'Taller', date: '2027-04-01T18:00:00.000Z', location: 'Café Aurora, Ñuñoa' });
    await inscribir(cata.id, ana);
    await inscribir(taller.id, ana, { quantity: 2 });
    await inscribir(cata.id, bruno);

    const res = await request(app).get('/api/tickets/my-tickets').set('Cookie', ana.cookie);
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'success');
    assert.equal(res.body.payload.length, 2);
    const [reciente, antiguo] = res.body.payload;
    assert.equal(reciente.event.title, 'Taller', 'del más reciente al más antiguo');
    assert.deepEqual(Object.keys(reciente.event).sort(), ['date', 'id', 'location', 'title']);
    assert.equal(reciente.event.location, 'Café Aurora, Ñuñoa');
    assert.equal(reciente.quantity, 2);
    assert.equal(antiguo.event.title, 'Cata');
    assert.ok(res.body.payload.every((t) => t.user === ana.id), 'nunca tickets de otros');
    assert.equal(JSON.stringify(res.body).includes('bruno'), false);
    assert.equal(JSON.stringify(res.body).includes('password'), false);
  });

  test('incluye los cancelados (historial) y responde [] sin inscripciones; sin sesión → 401', async () => {
    const organizer = await crearUsuarioConRol('organizer');
    const user = await crearUsuarioConRol('user');
    const evento = await crearEventoPublicado(organizer);
    const vacio = await request(app).get('/api/tickets/my-tickets').set('Cookie', user.cookie);
    assert.deepEqual(vacio.body, { status: 'success', payload: [] });

    const ticket = (await inscribir(evento.id, user)).body.payload;
    await request(app).patch(`/api/tickets/${ticket.id}/cancel`).set('Cookie', user.cookie);
    const res = await request(app).get('/api/tickets/my-tickets').set('Cookie', user.cookie);
    assert.equal(res.body.payload.length, 1);
    assert.equal(res.body.payload[0].status, 'cancelled');
    assert.equal((await request(app).get('/api/tickets/my-tickets')).status, 401);
  });
});

describe('GET /api/events/:eid/tickets', () => {
  test('organizer dueño → 200 con inscritos (usuario poblado sin datos sensibles) y cupos', async () => {
    const organizer = await crearUsuarioConRol('organizer');
    const ana = await crearUsuarioConRol('user', 'ana@mail.com');
    const bruno = await crearUsuarioConRol('user', 'bruno@mail.com');
    const evento = await crearEventoPublicado(organizer, { capacity: 10 });
    await inscribir(evento.id, ana, { quantity: 2 });
    const ticketBruno = (await inscribir(evento.id, bruno)).body.payload;
    await request(app).patch(`/api/tickets/${ticketBruno.id}/cancel`).set('Cookie', bruno.cookie);

    const res = await request(app).get(`/api/events/${evento.id}/tickets`).set('Cookie', organizer.cookie);
    assert.equal(res.status, 200);
    const { payload } = res.body;
    assert.deepEqual(payload.event, { id: evento.id, title: evento.title, date: evento.date, status: 'published', capacity: 10 });
    assert.equal(payload.cuposOcupados, 2, 'el cancelado no cuenta');
    assert.equal(payload.cuposDisponibles, 8);
    assert.equal(payload.tickets.length, 2, 'el historial incluye el cancelado');
    const [deAna, deBruno] = payload.tickets;
    assert.deepEqual(deAna.user, { id: ana.id, first_name: 'Usuario', last_name: 'user', email: 'ana@mail.com' });
    assert.equal(deAna.event, evento.id);
    assert.equal(deBruno.status, 'cancelled');
    assert.equal(JSON.stringify(payload).includes('password'), false);
    assert.equal(JSON.stringify(payload).includes('"role"'), false);
  });

  test('filtro ?status=confirmed; estado inválido → 400', async () => {
    const organizer = await crearUsuarioConRol('organizer');
    const ana = await crearUsuarioConRol('user', 'ana@mail.com');
    const bruno = await crearUsuarioConRol('user', 'bruno@mail.com');
    const evento = await crearEventoPublicado(organizer);
    await inscribir(evento.id, ana);
    const ticketBruno = (await inscribir(evento.id, bruno)).body.payload;
    await request(app).patch(`/api/tickets/${ticketBruno.id}/cancel`).set('Cookie', bruno.cookie);

    const confirmados = await request(app).get(`/api/events/${evento.id}/tickets?status=confirmed`).set('Cookie', organizer.cookie);
    assert.equal(confirmados.body.payload.tickets.length, 1);
    const cancelados = await request(app).get(`/api/events/${evento.id}/tickets?status=cancelled`).set('Cookie', organizer.cookie);
    assert.equal(cancelados.body.payload.tickets.length, 1);
    const invalido = await request(app).get(`/api/events/${evento.id}/tickets?status=activo`).set('Cookie', organizer.cookie);
    assert.equal(invalido.status, 400);
    assert.equal(invalido.body.message, 'El filtro status debe ser uno de: confirmed, pending, cancelled');
  });

  test('user común → 403; organizer de otro evento → 403; admin → 200', async () => {
    const duenio = await crearUsuarioConRol('organizer', 'duenio@mail.com');
    const otroOrganizer = await crearUsuarioConRol('organizer', 'otro@mail.com');
    const admin = await crearUsuarioConRol('admin');
    const user = await crearUsuarioConRol('user');
    const evento = await crearEventoPublicado(duenio);

    const comoUser = await request(app).get(`/api/events/${evento.id}/tickets`).set('Cookie', user.cookie);
    assert.equal(comoUser.status, 403);
    assert.deepEqual(comoUser.body, { status: 'error', message: 'No tienes permisos para realizar esta acción' });

    const comoOtro = await request(app).get(`/api/events/${evento.id}/tickets`).set('Cookie', otroOrganizer.cookie);
    assert.equal(comoOtro.status, 403);
    assert.deepEqual(comoOtro.body, { status: 'error', message: 'Solo puedes ver las inscripciones de tus propios eventos' });

    const comoAdmin = await request(app).get(`/api/events/${evento.id}/tickets`).set('Cookie', admin.cookie);
    assert.equal(comoAdmin.status, 200);
    assert.deepEqual(comoAdmin.body.payload.tickets, []);
    assert.equal(comoAdmin.body.payload.cuposDisponibles, evento.capacity);
  });

  test('evento inexistente → 404; sin sesión → 401', async () => {
    const admin = await crearUsuarioConRol('admin');
    const res = await request(app).get('/api/events/665f2a1b2c3d4e5f6a7b8c9d/tickets').set('Cookie', admin.cookie);
    assert.equal(res.status, 404);
    assert.equal((await request(app).get('/api/events/665f2a1b2c3d4e5f6a7b8c9d/tickets')).status, 401);
  });
});
