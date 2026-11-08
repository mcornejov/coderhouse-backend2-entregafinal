import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.js';
import Ticket from '../src/models/Ticket.js';
import User from '../src/models/User.js';
import { iniciarBaseDePrueba, limpiarBaseDePrueba, detenerBaseDePrueba } from './setup.js';
import { eventoValido } from './helpers.js';

// Los "casos a probar" de la pre-entrega 8: el flujo completo de la plataforma de punta a punta,
// pasando por todas las capas, y la verificación de que el comportamiento externo no cambió.

before(iniciarBaseDePrueba);
after(detenerBaseDePrueba);
beforeEach(limpiarBaseDePrueba);

const PASSWORD = 'Secreta123';

async function registrarYLoguear(nombre, email, role = 'user') {
  const registro = await request(app).post('/api/sessions/register').send({ first_name: nombre, last_name: 'Prueba', email, password: PASSWORD });
  assert.equal(registro.status, 201);
  assert.equal('password' in registro.body.payload, false, 'el registro no devuelve la contraseña');
  if (role !== 'user') await User.updateOne({ email }, { role });
  const login = await request(app).post('/api/sessions/login').send({ email, password: PASSWORD });
  assert.equal(login.status, 200);
  const cookie = login.headers['set-cookie'].find((c) => c.startsWith('currentUser=')).split(';')[0];
  return { id: registro.body.payload.id, email, cookie };
}

describe('Flujo completo: registro → login → crear evento → publicar → inscribirse → mis tickets → cancelar', () => {
  test('todas las capas en cadena, con respuestas idénticas a las entregas anteriores', async () => {
    const bruno = await registrarYLoguear('Bruno', 'bruno@mail.com', 'organizer');
    const carla = await registrarYLoguear('Carla', 'carla@mail.com');

    // /current no incluye password (ni hash)
    const current = await request(app).get('/api/sessions/current').set('Cookie', carla.cookie);
    assert.equal(current.status, 200);
    assert.deepEqual(current.body.payload, { id: carla.id, email: 'carla@mail.com', role: 'user' });

    // Crear evento (nace draft) y publicarlo
    const creado = await request(app).post('/api/events').set('Cookie', bruno.cookie).send({ ...eventoValido, capacity: 2 });
    assert.equal(creado.status, 201);
    assert.equal(creado.body.payload.status, 'draft');
    const eventoId = creado.body.payload.id;
    const publicado = await request(app).patch(`/api/events/${eventoId}/status`).set('Cookie', bruno.cookie).send({ status: 'published' });
    assert.equal(publicado.body.payload.status, 'published');

    // Inscribirse
    const inscripcion = await request(app).post(`/api/events/${eventoId}/tickets`).set('Cookie', carla.cookie).send({ quantity: 2 });
    assert.equal(inscripcion.status, 201);
    const ticket = inscripcion.body.payload;
    assert.equal(ticket.status, 'confirmed');
    assert.equal(ticket.user, carla.id);

    // Mis tickets, con el evento poblado y filtrado por el DTO
    const mios = await request(app).get('/api/tickets/my-tickets').set('Cookie', carla.cookie);
    assert.equal(mios.status, 200);
    assert.equal(mios.body.payload.length, 1);
    assert.deepEqual(Object.keys(mios.body.payload[0].event).sort(), ['date', 'id', 'location', 'title']);
    assert.equal(mios.body.payload[0].event.title, eventoValido.title);

    // El organizador ve a los inscritos poblados, sin password ni rol
    const inscritos = await request(app).get(`/api/events/${eventoId}/tickets`).set('Cookie', bruno.cookie);
    assert.equal(inscritos.status, 200);
    assert.equal(inscritos.body.payload.cuposDisponibles, 0);
    assert.deepEqual(inscritos.body.payload.tickets[0].user, { id: carla.id, first_name: 'Carla', last_name: 'Prueba', email: 'carla@mail.com' });
    assert.equal(JSON.stringify(inscritos.body).includes('password'), false);

    // Cancelar: estado + fecha, documento conservado, cupo liberado
    const cancelado = await request(app).patch(`/api/tickets/${ticket.id}/cancel`).set('Cookie', carla.cookie);
    assert.equal(cancelado.status, 200);
    assert.equal(cancelado.body.payload.status, 'cancelled');
    assert.ok(cancelado.body.payload.cancelledAt);
    assert.equal(await Ticket.countDocuments(), 1);
    const despues = await request(app).get(`/api/events/${eventoId}/tickets`).set('Cookie', bruno.cookie);
    assert.equal(despues.body.payload.cuposDisponibles, 2);

    // Logout cierra la sesión
    const logout = await request(app).post('/api/sessions/logout').set('Cookie', carla.cookie);
    assert.deepEqual(logout.body, { status: 'success', message: 'Sesión cerrada' });
  });

  test('ningún hash de contraseña sale por ninguna respuesta del flujo', async () => {
    const bruno = await registrarYLoguear('Bruno', 'bruno@mail.com', 'organizer');
    const carla = await registrarYLoguear('Carla', 'carla@mail.com');
    const hash = (await User.findOne({ email: 'carla@mail.com' }).lean()).password;
    assert.match(hash, /^\$2[aby]\$/, 'en la base hay un hash de bcrypt');

    const creado = await request(app).post('/api/events').set('Cookie', bruno.cookie).send(eventoValido);
    await request(app).patch(`/api/events/${creado.body.payload.id}/status`).set('Cookie', bruno.cookie).send({ status: 'published' });
    await request(app).post(`/api/events/${creado.body.payload.id}/tickets`).set('Cookie', carla.cookie).send({});

    const respuestas = [
      await request(app).get('/api/sessions/current').set('Cookie', carla.cookie),
      await request(app).get('/api/tickets/my-tickets').set('Cookie', carla.cookie),
      await request(app).get(`/api/events/${creado.body.payload.id}/tickets`).set('Cookie', bruno.cookie),
      await request(app).get('/api/events'),
    ];
    for (const res of respuestas) {
      const texto = JSON.stringify(res.body);
      assert.equal(texto.includes(hash), false);
      assert.equal(texto.includes('password'), false);
      assert.equal(texto.includes('$2b$'), false);
    }
  });
});

describe('Errores con el código correcto, nunca 500', () => {
  test('error de negocio → 409; datos inválidos → 400; inexistente → 404', async () => {
    const bruno = await registrarYLoguear('Bruno', 'bruno@mail.com', 'organizer');
    const carla = await registrarYLoguear('Carla', 'carla@mail.com');
    const creado = await request(app).post('/api/events').set('Cookie', bruno.cookie).send(eventoValido);
    const eventoId = creado.body.payload.id;

    const borrador = await request(app).post(`/api/events/${eventoId}/tickets`).set('Cookie', carla.cookie).send({});
    assert.deepEqual([borrador.status, borrador.body], [409, { status: 'error', message: 'El evento todavía no está publicado' }]);

    const invalido = await request(app).post('/api/events').set('Cookie', bruno.cookie).send({ ...eventoValido, capacity: 0 });
    assert.equal(invalido.status, 400);

    const inexistente = await request(app).get('/api/events/665f2a1b2c3d4e5f6a7b8c9d');
    assert.equal(inexistente.status, 404);

    const transicion = await request(app).patch(`/api/events/${eventoId}/status`).set('Cookie', bruno.cookie).send({ status: 'finished' });
    assert.equal(transicion.status, 409);
  });

  test('protegido sin sesión → 401; con sesión sin permisos → 403; formato de error uniforme', async () => {
    const carla = await registrarYLoguear('Carla', 'carla@mail.com');
    const sinSesion = await request(app).post('/api/events').send(eventoValido);
    assert.deepEqual([sinSesion.status, sinSesion.body], [401, { status: 'error', message: 'No autenticado' }]);
    const sinPermiso = await request(app).post('/api/events').set('Cookie', carla.cookie).send(eventoValido);
    assert.deepEqual([sinPermiso.status, sinPermiso.body], [403, { status: 'error', message: 'No tienes permisos para realizar esta acción' }]);
    const usuarios = await request(app).get('/api/users').set('Cookie', carla.cookie);
    assert.equal(usuarios.status, 403);
    for (const res of [sinSesion, sinPermiso, usuarios]) {
      assert.deepEqual(Object.keys(res.body).sort(), ['message', 'status']);
      assert.equal(res.body.status, 'error');
    }
  });
});
