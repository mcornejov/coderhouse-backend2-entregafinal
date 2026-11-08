import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.js';
import Ticket from '../src/models/Ticket.js';
import Event from '../src/models/Event.js';
import { transporter } from '../src/config/mail.config.js';
import { RESERVATION_CODE_REGEX } from '../src/utils/reservationCode.util.js';
import { iniciarBaseDePrueba, limpiarBaseDePrueba, detenerBaseDePrueba } from './setup.js';
import { crearUsuarioConRol, crearEventoPublicado, eventoValido } from './helpers.js';

// Flujo de inscripción: POST /api/events/:eid/tickets, cancelación PATCH /api/tickets/:tid/cancel,
// correo de confirmación y los casos de la consigna.

before(iniciarBaseDePrueba);
after(detenerBaseDePrueba);
beforeEach(limpiarBaseDePrueba);

// Observa los correos: el transporte de tests es jsonTransport (no sale nada a la red) y se
// envuelve sendMail para registrar cada mensaje
const enviados = [];
const sendMailOriginal = transporter.sendMail.bind(transporter);
transporter.sendMail = async (mensaje) => { enviados.push(mensaje); return sendMailOriginal(mensaje); };
beforeEach(() => { enviados.length = 0; });

const inscribir = (eventId, usuario, body = {}) =>
  request(app).post(`/api/events/${eventId}/tickets`).set('Cookie', usuario.cookie).send(body);
const cancelar = (ticketId, usuario) =>
  request(app).patch(`/api/tickets/${ticketId}/cancel`).set('Cookie', usuario.cookie);

describe('POST /api/events/:eid/tickets (inscripción)', () => {
  test('inscripción exitosa → 201 con el ticket confirmado y un correo enviado', async () => {
    const organizer = await crearUsuarioConRol('organizer');
    const user = await crearUsuarioConRol('user', 'carla@mail.com');
    const evento = await crearEventoPublicado(organizer);

    const res = await inscribir(evento.id, user);
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const { payload } = res.body;
    assert.equal(payload.status, 'confirmed');
    assert.equal(payload.quantity, 1);
    assert.equal(payload.user, user.id);
    assert.equal(payload.event, evento.id);
    assert.match(payload.reservationCode, RESERVATION_CODE_REGEX);
    assert.equal(payload.cancelledAt, null);
    assert.ok(payload.createdAt);
    assert.equal('_id' in payload, false);

    // Correo: al inscrito, con el código, el evento y el lugar
    assert.equal(enviados.length, 1);
    const [correo] = enviados;
    assert.equal(correo.to, 'carla@mail.com');
    assert.equal(correo.subject, `Inscripción confirmada: ${eventoValido.title}`);
    assert.match(correo.text, new RegExp(payload.reservationCode));
    assert.match(correo.text, /Café Aurora, Providencia/);
    assert.match(correo.html, new RegExp(payload.reservationCode));
    assert.ok(correo.from);
  });

  test('quantity > 1 reserva varios lugares; el correo lo indica', async () => {
    const organizer = await crearUsuarioConRol('organizer');
    const user = await crearUsuarioConRol('user');
    const evento = await crearEventoPublicado(organizer);
    const res = await inscribir(evento.id, user, { quantity: 3 });
    assert.equal(res.status, 201);
    assert.equal(res.body.payload.quantity, 3);
    assert.match(enviados[0].text, /3 lugares/);
  });

  test('el ticket guarda referencias, no objetos embebidos', async () => {
    const organizer = await crearUsuarioConRol('organizer');
    const user = await crearUsuarioConRol('user');
    const evento = await crearEventoPublicado(organizer);
    const res = await inscribir(evento.id, user);
    const enBase = await Ticket.findById(res.body.payload.id).lean();
    assert.equal(String(enBase.user), user.id);
    assert.equal(String(enBase.event), evento.id);
    assert.equal(enBase.user.email, undefined);
    assert.equal(enBase.event.title, undefined);
  });

  test('user, status, reservationCode y cancelledAt del body se ignoran', async () => {
    const organizer = await crearUsuarioConRol('organizer');
    const user = await crearUsuarioConRol('user');
    const otro = await crearUsuarioConRol('user', 'otro@mail.com');
    const evento = await crearEventoPublicado(organizer);
    const res = await inscribir(evento.id, user, { user: otro.id, status: 'pending', reservationCode: 'HACK', cancelledAt: '2020-01-01' });
    assert.equal(res.status, 201);
    assert.equal(res.body.payload.user, user.id);
    assert.equal(res.body.payload.status, 'confirmed');
    assert.notEqual(res.body.payload.reservationCode, 'HACK');
    assert.equal(res.body.payload.cancelledAt, null);
  });

  test('sin sesión → 401', async () => {
    const organizer = await crearUsuarioConRol('organizer');
    const evento = await crearEventoPublicado(organizer);
    const res = await request(app).post(`/api/events/${evento.id}/tickets`).send({});
    assert.equal(res.status, 401);
    assert.deepEqual(res.body, { status: 'error', message: 'No autenticado' });
  });

  test('organizer y admin también pueden inscribirse (basta estar autenticado)', async () => {
    const organizer = await crearUsuarioConRol('organizer');
    const admin = await crearUsuarioConRol('admin');
    const evento = await crearEventoPublicado(organizer);
    assert.equal((await inscribir(evento.id, organizer)).status, 201);
    assert.equal((await inscribir(evento.id, admin)).status, 201);
  });

  test('evento inexistente → 404; id inválido → 400', async () => {
    const user = await crearUsuarioConRol('user');
    const inexistente = await inscribir('665f2a1b2c3d4e5f6a7b8c9d', user);
    assert.equal(inexistente.status, 404);
    assert.equal(inexistente.body.message, 'No existe un evento con id 665f2a1b2c3d4e5f6a7b8c9d');
    const invalido = await inscribir('abc', user);
    assert.equal(invalido.status, 400);
    assert.equal(invalido.body.message, 'El identificador enviado no es válido');
  });

  test('evento en draft, cancelado o finalizado → 409 con el motivo', async () => {
    const organizer = await crearUsuarioConRol('organizer');
    const user = await crearUsuarioConRol('user');
    const casos = [
      ['draft', 'El evento todavía no está publicado'],
      ['cancelled', 'El evento está cancelado'],
      ['finished', 'El evento ya finalizó'],
    ];
    for (const [status, mensaje] of casos) {
      const evento = await crearEventoPublicado(organizer, { title: `Evento ${status}` });
      await Event.updateOne({ _id: evento.id }, { status });
      const res = await inscribir(evento.id, user);
      assert.equal(res.status, 409, status);
      assert.deepEqual(res.body, { status: 'error', message: mensaje });
    }
    assert.equal(await Ticket.countDocuments(), 0);
    assert.equal(enviados.length, 0, 'sin inscripción no hay correo');
  });

  test('evento publicado cuya fecha ya pasó → 409', async () => {
    const organizer = await crearUsuarioConRol('organizer');
    const user = await crearUsuarioConRol('user');
    const evento = await crearEventoPublicado(organizer);
    await Event.updateOne({ _id: evento.id }, { date: new Date('2020-01-01') });
    const res = await inscribir(evento.id, user);
    assert.equal(res.status, 409);
    assert.equal(res.body.message, 'El evento ya ocurrió');
  });

  test('quantity inválida → 400', async () => {
    const organizer = await crearUsuarioConRol('organizer');
    const user = await crearUsuarioConRol('user');
    const evento = await crearEventoPublicado(organizer, { capacity: 50 });
    for (const quantity of [0, -1, 1.5, '2', null, true, 11, [1], { n: 1 }]) {
      const res = await inscribir(evento.id, user, { quantity });
      assert.equal(res.status, 400, JSON.stringify(quantity));
      assert.equal(res.body.message, 'El campo quantity debe ser un entero entre 1 y 10');
    }
    assert.equal(await Ticket.countDocuments(), 0);
  });

  test('inscripción duplicada activa → 409 con el código existente; una cancelada no cuenta', async () => {
    const organizer = await crearUsuarioConRol('organizer');
    const user = await crearUsuarioConRol('user');
    const evento = await crearEventoPublicado(organizer);
    const primera = await inscribir(evento.id, user);
    const duplicada = await inscribir(evento.id, user);
    assert.equal(duplicada.status, 409);
    assert.equal(duplicada.body.message, `Ya tienes una inscripción activa para este evento (código ${primera.body.payload.reservationCode})`);
    assert.equal(await Ticket.countDocuments(), 1);

    await cancelar(primera.body.payload.id, user);
    const nueva = await inscribir(evento.id, user);
    assert.equal(nueva.status, 201, 'tras cancelar puede volver a inscribirse');
    assert.equal(await Ticket.countDocuments(), 2, 'la cancelada se conserva');
  });

  test('un ticket pending también cuenta como activo (duplicado y cupo)', async () => {
    const organizer = await crearUsuarioConRol('organizer');
    const user = await crearUsuarioConRol('user');
    const evento = await crearEventoPublicado(organizer, { capacity: 2 });
    const res = await inscribir(evento.id, user);
    await Ticket.updateOne({ _id: res.body.payload.id }, { status: 'pending' });
    assert.equal((await inscribir(evento.id, user)).status, 409);
    const otro = await crearUsuarioConRol('user', 'otro@mail.com');
    const sinCupo = await inscribir(evento.id, otro, { quantity: 2 });
    assert.equal(sinCupo.status, 409);
    assert.equal(sinCupo.body.message, 'No hay cupo suficiente: quedan 1 lugares y solicitaste 2');
  });

  test('el índice único de la base también impide el duplicado activo (segunda barrera) → 409', async () => {
    const organizer = await crearUsuarioConRol('organizer');
    const user = await crearUsuarioConRol('user');
    const evento = await crearEventoPublicado(organizer);
    await Ticket.create({ user: user.id, event: evento.id, quantity: 1, reservationCode: 'AUR-AAAAAAAA' });
    await assert.rejects(
      Ticket.create({ user: user.id, event: evento.id, quantity: 1, reservationCode: 'AUR-BBBBBBBB' }),
      (error) => error.code === 11000
    );
    // Una cancelada no participa del índice
    await Ticket.updateOne({ reservationCode: 'AUR-AAAAAAAA' }, { status: 'cancelled' });
    await assert.doesNotReject(Ticket.create({ user: user.id, event: evento.id, quantity: 1, reservationCode: 'AUR-CCCCCCCC' }));
  });

  test('si el correo falla, la inscripción igual responde 201', async () => {
    const organizer = await crearUsuarioConRol('organizer');
    const user = await crearUsuarioConRol('user');
    const evento = await crearEventoPublicado(organizer);
    const respaldo = transporter.sendMail;
    transporter.sendMail = async () => { throw new Error('SMTP caído'); };
    try {
      const res = await inscribir(evento.id, user);
      assert.equal(res.status, 201);
      assert.equal(await Ticket.countDocuments(), 1);
    } finally {
      transporter.sendMail = respaldo;
    }
  });
});

describe('PATCH /api/tickets/:tid/cancel (cancelación)', () => {
  test('cancelación propia → 200 cancelled con cancelledAt; el documento se conserva', async () => {
    const organizer = await crearUsuarioConRol('organizer');
    const user = await crearUsuarioConRol('user');
    const evento = await crearEventoPublicado(organizer);
    const ticket = (await inscribir(evento.id, user)).body.payload;

    const res = await cancelar(ticket.id, user);
    assert.equal(res.status, 200);
    assert.equal(res.body.payload.id, ticket.id);
    assert.equal(res.body.payload.status, 'cancelled');
    assert.ok(res.body.payload.cancelledAt);
    assert.ok(Math.abs(new Date(res.body.payload.cancelledAt) - Date.now()) < 5000);
    assert.equal(res.body.payload.reservationCode, ticket.reservationCode);
    assert.equal(await Ticket.countDocuments({ _id: ticket.id }), 1, 'no se elimina físicamente');
  });

  test('cancelar libera el cupo: la siguiente inscripción por ese lugar funciona', async () => {
    const organizer = await crearUsuarioConRol('organizer');
    const ana = await crearUsuarioConRol('user', 'ana@mail.com');
    const bruno = await crearUsuarioConRol('user', 'bruno@mail.com');
    const evento = await crearEventoPublicado(organizer, { capacity: 1 });

    const ticketAna = (await inscribir(evento.id, ana)).body.payload;
    const sinCupo = await inscribir(evento.id, bruno);
    assert.equal(sinCupo.status, 409);
    assert.equal(sinCupo.body.message, 'El evento no tiene cupos disponibles');

    assert.equal((await cancelar(ticketAna.id, ana)).status, 200);
    const conCupo = await inscribir(evento.id, bruno);
    assert.equal(conCupo.status, 201);
  });

  test('cancelar un ticket ajeno como user → 403 y el ticket no cambia', async () => {
    const organizer = await crearUsuarioConRol('organizer');
    const duenio = await crearUsuarioConRol('user', 'duenio@mail.com');
    const intruso = await crearUsuarioConRol('user', 'intruso@mail.com');
    const evento = await crearEventoPublicado(organizer);
    const ticket = (await inscribir(evento.id, duenio)).body.payload;

    const res = await cancelar(ticket.id, intruso);
    assert.equal(res.status, 403);
    assert.deepEqual(res.body, { status: 'error', message: 'Solo puedes cancelar tus propios tickets' });
    assert.equal((await Ticket.findById(ticket.id).lean()).status, 'confirmed');
  });

  test('el organizer del evento tampoco cancela tickets ajenos; el admin sí', async () => {
    const organizer = await crearUsuarioConRol('organizer');
    const admin = await crearUsuarioConRol('admin');
    const user = await crearUsuarioConRol('user');
    const evento = await crearEventoPublicado(organizer);
    const ticket = (await inscribir(evento.id, user)).body.payload;
    assert.equal((await cancelar(ticket.id, organizer)).status, 403);
    const porAdmin = await cancelar(ticket.id, admin);
    assert.equal(porAdmin.status, 200);
    assert.equal(porAdmin.body.payload.status, 'cancelled');
  });

  test('al cancelar se envía un correo de cancelación al dueño del ticket (también si cancela un admin)', async () => {
    const organizer = await crearUsuarioConRol('organizer');
    const admin = await crearUsuarioConRol('admin');
    const user = await crearUsuarioConRol('user', 'carla@mail.com');
    const evento = await crearEventoPublicado(organizer);
    const ticket = (await inscribir(evento.id, user)).body.payload;
    enviados.length = 0;

    await cancelar(ticket.id, admin);
    // El aviso no bloquea la respuesta: se resuelve en segundo plano tras consultar dueño y evento
    for (let intentos = 0; enviados.length === 0 && intentos < 50; intentos++) {
      await new Promise((r) => setTimeout(r, 20));
    }
    assert.equal(enviados.length, 1);
    assert.equal(enviados[0].to, 'carla@mail.com', 'el aviso va al dueño, no al admin');
    assert.equal(enviados[0].subject, `Inscripción cancelada: ${eventoValido.title}`);
    assert.match(enviados[0].text, new RegExp(ticket.reservationCode));
  });

  test('cancelar dos veces → 409', async () => {
    const organizer = await crearUsuarioConRol('organizer');
    const user = await crearUsuarioConRol('user');
    const evento = await crearEventoPublicado(organizer);
    const ticket = (await inscribir(evento.id, user)).body.payload;
    await cancelar(ticket.id, user);
    const res = await cancelar(ticket.id, user);
    assert.equal(res.status, 409);
    assert.deepEqual(res.body, { status: 'error', message: 'El ticket ya está cancelado' });
  });

  test('ticket inexistente → 404; id inválido → 400; sin sesión → 401', async () => {
    const user = await crearUsuarioConRol('user');
    const inexistente = await cancelar('665f2a1b2c3d4e5f6a7b8c9d', user);
    assert.equal(inexistente.status, 404);
    assert.equal(inexistente.body.message, 'No existe un ticket con id 665f2a1b2c3d4e5f6a7b8c9d');
    assert.equal((await cancelar('abc', user)).status, 400);
    const sinSesion = await request(app).patch('/api/tickets/665f2a1b2c3d4e5f6a7b8c9d/cancel');
    assert.equal(sinSesion.status, 401);
  });
});
