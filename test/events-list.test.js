import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.js';
import Event from '../src/models/Event.js';
import EventsService from '../src/services/events.service.js';
import { PAGINACION } from '../src/config/events.config.js';
import { iniciarBaseDePrueba, limpiarBaseDePrueba, detenerBaseDePrueba } from './setup.js';
import { crearUsuarioConRol, eventoValido } from './helpers.js';

// GET /api/events: filtros (status, category, location, dateFrom, dateTo), paginación
// (page, limit) y orden (sort). Siempre responde { status, data, page, limit, total, totalPages }.

const EVENTS = '/api/events';

before(iniciarBaseDePrueba);
after(detenerBaseDePrueba);
beforeEach(limpiarBaseDePrueba);

// Doce eventos de prueba se insertan directamente en la base (el listado no depende de la API
// de creación). Las fechas van de marzo a febrero del año siguiente, una por mes.
async function sembrarEventos(organizerId) {
  const eventos = [];
  for (let i = 0; i < 12; i++) {
    const fecha = new Date(Date.UTC(2027, 2 + i, 10, 19, 0, 0)); // 10 de cada mes desde marzo 2027
    eventos.push({
      ...eventoValido,
      title: `Evento ${String(i + 1).padStart(2, '0')}`,
      category: i % 3 === 0 ? 'workshop' : i % 3 === 1 ? 'cata' : 'charla',
      location: i % 2 === 0 ? 'Café Aurora, Providencia' : 'Café Aurora, Ñuñoa',
      status: i < 7 ? 'published' : i < 10 ? 'draft' : 'cancelled',
      date: fecha,
      price: i * 1000,
      capacity: 5 + i,
      organizer: organizerId,
    });
  }
  await Event.insertMany(eventos);
  return eventos;
}

async function listar(query = '') {
  const res = await request(app).get(`${EVENTS}${query}`);
  return res;
}

describe('Formato y paginación', () => {
  test('respuesta con data, page, limit, total y totalPages; valores por defecto page=1 limit=10', async () => {
    const organizer = await crearUsuarioConRol('organizer');
    await sembrarEventos(organizer.id);
    const res = await listar();
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'success');
    assert.deepEqual(Object.keys(res.body).sort(), ['data', 'limit', 'page', 'status', 'total', 'totalPages']);
    assert.equal(res.body.page, 1);
    assert.equal(res.body.limit, 10);
    assert.equal(res.body.total, 12);
    assert.equal(res.body.totalPages, 2);
    assert.equal(res.body.data.length, 10);
    assert.equal('payload' in res.body, false);
  });

  test('page=2&limit=5 devuelve los eventos 6 a 10 en orden de fecha', async () => {
    const organizer = await crearUsuarioConRol('organizer');
    await sembrarEventos(organizer.id);
    const res = await listar('?page=2&limit=5');
    assert.equal(res.status, 200);
    assert.equal(res.body.page, 2);
    assert.equal(res.body.limit, 5);
    assert.equal(res.body.total, 12);
    assert.equal(res.body.totalPages, 3);
    assert.deepEqual(res.body.data.map((e) => e.title), ['Evento 06', 'Evento 07', 'Evento 08', 'Evento 09', 'Evento 10']);
  });

  test('una página más allá del final → 200 con data vacía (total y totalPages siguen informando)', async () => {
    const organizer = await crearUsuarioConRol('organizer');
    await sembrarEventos(organizer.id);
    const res = await listar('?page=9&limit=5');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data, []);
    assert.equal(res.body.total, 12);
    assert.equal(res.body.totalPages, 3);
  });

  test('cada elemento de data es el DTO (id string, organizer string, sin _id ni __v)', async () => {
    const organizer = await crearUsuarioConRol('organizer');
    await sembrarEventos(organizer.id);
    const [evento] = (await listar('?limit=1')).body.data;
    assert.equal(typeof evento.id, 'string');
    assert.equal(evento.organizer, organizer.id);
    assert.equal(evento.category, 'workshop');
    assert.equal('_id' in evento, false);
    assert.equal('__v' in evento, false);
  });

  test('page o limit inválidos → 400', async () => {
    const casos = [
      ['?page=0', 'El parámetro page debe ser un entero mayor que 0'],
      ['?page=-1', 'El parámetro page debe ser un entero mayor que 0'],
      ['?page=abc', 'El parámetro page debe ser un entero mayor que 0'],
      ['?page=1.5', 'El parámetro page debe ser un entero mayor que 0'],
      ['?limit=0', `El parámetro limit debe ser un entero entre 1 y ${PAGINACION.LIMITE_MAXIMO}`],
      ['?limit=51', `El parámetro limit debe ser un entero entre 1 y ${PAGINACION.LIMITE_MAXIMO}`],
      ['?limit=todos', `El parámetro limit debe ser un entero entre 1 y ${PAGINACION.LIMITE_MAXIMO}`],
      ['?page=1&page=2', 'El parámetro page debe indicarse una sola vez como texto'],
    ];
    for (const [query, mensaje] of casos) {
      const res = await listar(query);
      assert.equal(res.status, 400, query);
      assert.deepEqual(res.body, { status: 'error', message: mensaje });
    }
  });

  test('el límite máximo impide traer toda la colección de una vez', async () => {
    const res = await listar(`?limit=${PAGINACION.LIMITE_MAXIMO}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.limit, PAGINACION.LIMITE_MAXIMO);
  });
});

describe('Filtros', () => {
  test('status=published', async () => {
    const organizer = await crearUsuarioConRol('organizer');
    await sembrarEventos(organizer.id);
    const res = await listar('?status=published&limit=50');
    assert.equal(res.body.total, 7);
    assert.ok(res.body.data.every((e) => e.status === 'published'));
  });

  test('category (sin distinguir mayúsculas) y combinación con status', async () => {
    const organizer = await crearUsuarioConRol('organizer');
    await sembrarEventos(organizer.id);
    const workshop = await listar('?category=Workshop');
    assert.equal(workshop.body.total, 4); // eventos 1, 4, 7, 10
    const combinado = await listar('?status=published&category=workshop');
    assert.equal(combinado.body.total, 3); // 1, 4, 7
    assert.deepEqual(combinado.body.data.map((e) => e.title), ['Evento 01', 'Evento 04', 'Evento 07']);
  });

  test('el caso de la consigna: ?status=published&category=workshop&page=2&limit=5', async () => {
    const organizer = await crearUsuarioConRol('organizer');
    await sembrarEventos(organizer.id);
    const res = await listar('?status=published&category=workshop&page=2&limit=5');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { status: 'success', data: [], page: 2, limit: 5, total: 3, totalPages: 1 });
  });

  test('location busca por texto contenido sin distinguir mayúsculas y escapando caracteres especiales', async () => {
    const organizer = await crearUsuarioConRol('organizer');
    await sembrarEventos(organizer.id);
    assert.equal((await listar('?location=providencia')).body.total, 6);
    assert.equal((await listar('?location=%C3%B1u%C3%B1oa')).body.total, 6); // ñuñoa
    assert.equal((await listar('?location=Caf%C3%A9%20Aurora')).body.total, 12);
    // "." como regex casaría con cualquier carácter; escapado no encuentra nada
    assert.equal((await listar('?location=.*')).body.total, 0);
    assert.equal((await listar('?location=Aurora,%20Prov')).body.total, 6);
  });

  test('rango de fechas dateFrom / dateTo (inclusivo; dateTo sin hora abarca el día completo)', async () => {
    const organizer = await crearUsuarioConRol('organizer');
    await sembrarEventos(organizer.id);
    const desde = await listar('?dateFrom=2027-06-01&limit=50');
    assert.equal(desde.body.total, 9); // junio 2027 a febrero 2028
    const hasta = await listar('?dateTo=2027-05-10&limit=50');
    assert.equal(hasta.body.total, 3, 'el evento de las 19:00 del 10 de mayo entra en el rango');
    const hastaExacto = await listar('?dateTo=2027-05-10T18:00:00.000Z&limit=50');
    assert.equal(hastaExacto.body.total, 2, 'con hora explícita el límite es exacto');
    const sinZona = await listar('?dateTo=2027-05-10T19:00:00&limit=50');
    assert.equal(sinZona.body.total, 3, 'sin zona se interpreta como UTC, no como hora local');
    const rango = await listar('?dateFrom=2027-06-01&dateTo=2027-08-31&limit=50');
    assert.deepEqual(rango.body.data.map((e) => e.title), ['Evento 04', 'Evento 05', 'Evento 06']);
  });

  test('status, dateFrom o dateTo inválidos → 400; dateFrom posterior a dateTo → 400', async () => {
    const casos = [
      ['?status=activo', 'El filtro status debe ser uno de: draft, published, cancelled, finished'],
      ['?status=PUBLISHED', 'El filtro status debe ser uno de: draft, published, cancelled, finished'],
      ['?dateFrom=ayer', 'El filtro dateFrom debe ser una fecha válida en formato ISO 8601'],
      ['?dateTo=2027-02-30', 'El filtro dateTo debe ser una fecha válida en formato ISO 8601'],
      ['?dateFrom=1', 'El filtro dateFrom debe ser una fecha válida en formato ISO 8601'],
      ['?dateFrom=2027-09-01&dateTo=2027-03-01', 'El filtro dateFrom no puede ser posterior a dateTo'],
      ['?status=draft&status=published', 'El parámetro status debe indicarse una sola vez como texto'],
    ];
    for (const [query, mensaje] of casos) {
      const res = await listar(query);
      assert.equal(res.status, 400, query);
      assert.equal(res.body.message, mensaje);
    }
  });

  test('parámetros desconocidos y valores vacíos se ignoran', async () => {
    const organizer = await crearUsuarioConRol('organizer');
    await sembrarEventos(organizer.id);
    const res = await listar('?status=&category=%20&foo=bar&organizer=x');
    assert.equal(res.status, 200);
    assert.equal(res.body.total, 12);
  });
});

describe('Ordenamiento', () => {
  test('por defecto ordena por fecha ascendente', async () => {
    const organizer = await crearUsuarioConRol('organizer');
    await sembrarEventos(organizer.id);
    const { data } = (await listar('?limit=50')).body;
    const fechas = data.map((e) => new Date(e.date).getTime());
    assert.deepEqual(fechas, [...fechas].sort((a, b) => a - b));
    assert.equal(data[0].title, 'Evento 01');
  });

  test('sort=-date invierte; sort=price y sort=-price ordenan por precio', async () => {
    const organizer = await crearUsuarioConRol('organizer');
    await sembrarEventos(organizer.id);
    const desc = (await listar('?sort=-date&limit=3')).body.data.map((e) => e.title);
    assert.deepEqual(desc, ['Evento 12', 'Evento 11', 'Evento 10']);
    const barato = (await listar('?sort=price&limit=2')).body.data.map((e) => e.price);
    assert.deepEqual(barato, [0, 1000]);
    const caro = (await listar('?sort=-price&limit=2')).body.data.map((e) => e.price);
    assert.deepEqual(caro, [11000, 10000]);
  });

  test('sort=title y sort=capacity también están permitidos', async () => {
    const organizer = await crearUsuarioConRol('organizer');
    await sembrarEventos(organizer.id);
    assert.equal((await listar('?sort=-title&limit=1')).body.data[0].title, 'Evento 12');
    assert.equal((await listar('?sort=-capacity&limit=1')).body.data[0].capacity, 16);
  });

  test('sort por un campo desconocido → 400 (no se permite ordenar por campos arbitrarios)', async () => {
    for (const sort of ['organizer', 'password', '__proto__', '-status', 'date;drop']) {
      const res = await listar(`?sort=${encodeURIComponent(sort)}`);
      assert.equal(res.status, 400, sort);
      assert.match(res.body.message, /^El parámetro sort debe ser uno de: date, price, title, capacity, createdAt/);
    }
  });

  test('las páginas no repiten ni pierden eventos aunque compartan fecha', async () => {
    const organizer = await crearUsuarioConRol('organizer');
    const mismaFecha = Array.from({ length: 7 }, (_, i) => ({
      ...eventoValido, title: `Repetido ${i}`, date: new Date('2027-05-05T19:00:00Z'), organizer: organizer.id,
    }));
    await Event.insertMany(mismaFecha);
    const p1 = (await listar('?limit=3&page=1')).body.data.map((e) => e.id);
    const p2 = (await listar('?limit=3&page=2')).body.data.map((e) => e.id);
    const p3 = (await listar('?limit=3&page=3')).body.data.map((e) => e.id);
    const todos = [...p1, ...p2, ...p3];
    assert.equal(todos.length, 7);
    assert.equal(new Set(todos).size, 7);
  });
});

describe('El servicio traduce la query a criterios neutros (sin sintaxis de MongoDB)', () => {
  test('entrega al repositorio filtro, orden, page y limit ya validados', async () => {
    let recibido = null;
    const repositorio = { buscar: async (filtro, paginacion) => { recibido = { filtro, paginacion }; return { data: [], total: 0 }; } };
    const resultado = await new EventsService(repositorio).listar({
      status: 'published', category: ' Cata ', location: 'Providencia', dateFrom: '2027-03-01', dateTo: '2027-03-31', page: '3', limit: '7', sort: '-price',
    });
    assert.deepEqual(recibido.paginacion, { page: 3, limit: 7, orden: { price: -1 } });
    assert.equal(recibido.filtro.status, 'published');
    assert.equal(recibido.filtro.category, 'cata');
    assert.equal(recibido.filtro.location, 'Providencia');
    assert.equal(recibido.filtro.dateFrom.toISOString(), '2027-03-01T00:00:00.000Z');
    assert.equal(recibido.filtro.dateTo.toISOString(), '2027-03-31T23:59:59.999Z');
    assert.equal(JSON.stringify(recibido.filtro).includes('$'), false, 'ningún operador de MongoDB');
    assert.deepEqual(resultado, { data: [], page: 3, limit: 7, total: 0, totalPages: 0 });
  });
});
