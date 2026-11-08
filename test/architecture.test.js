import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { toUserDTO, toSessionDTO } from '../src/dto/user.dto.js';
import { toEventDTO } from '../src/dto/event.dto.js';
import { toTicketDTO } from '../src/dto/ticket.dto.js';

// Reglas de dependencia entre capas, verificadas sobre el código fuente: si alguien importa un
// modelo desde un service o un controller, este test falla antes de que llegue a producción.
//   routes → controllers → services → repositories → dao → models
// Los routers (y passport.config / scripts) son las "raíces de composición": arman la cadena
// `new Controller(new Service(new Repository(new Dao())))` y por eso pueden importar DAOs.

const SRC = new URL('../src/', import.meta.url).pathname;

function archivosDe(carpeta) {
  const ruta = join(SRC, carpeta);
  if (!existsSync(ruta)) return [];
  return readdirSync(ruta).filter((f) => f.endsWith('.js')).map((f) => ({ nombre: `${carpeta}/${f}`, codigo: readFileSync(join(ruta, f), 'utf8') }));
}

function importaDe(codigo, patron) {
  return new RegExp(`from '[^']*${patron}[^']*'`).test(codigo);
}

const todos = ['config', 'controllers', 'dao', 'dto', 'middlewares', 'models', 'repositories', 'routes', 'scripts', 'services', 'utils']
  .flatMap(archivosDe)
  .concat([{ nombre: 'app.js', codigo: readFileSync(join(SRC, 'app.js'), 'utf8') }, { nombre: 'server.js', codigo: readFileSync(join(SRC, 'server.js'), 'utf8') }]);

describe('Capas: una por entidad principal', () => {
  for (const entidad of ['users', 'events', 'tickets']) {
    test(`${entidad}: DAO, Repository, Service y Controller existen`, () => {
      for (const capa of ['dao', 'repositories', 'services', 'controllers']) {
        const sufijo = { dao: 'dao', repositories: 'repository', services: 'service', controllers: 'controller' }[capa];
        assert.ok(existsSync(join(SRC, capa, `${entidad}.${sufijo}.js`)), `falta src/${capa}/${entidad}.${sufijo}.js`);
      }
    });
  }

  test('hay un DTO por entidad: user, event y ticket', () => {
    for (const dto of ['user', 'event', 'ticket']) {
      assert.ok(existsSync(join(SRC, 'dto', `${dto}.dto.js`)), `falta src/dto/${dto}.dto.js`);
    }
  });
});

describe('Reglas de dependencia (análisis del código fuente)', () => {
  test('solo los DAOs importan modelos de Mongoose', () => {
    const infractores = todos.filter((a) => !a.nombre.startsWith('dao/') && importaDe(a.codigo, 'models/'));
    assert.deepEqual(infractores.map((a) => a.nombre), []);
  });

  test('mongoose solo se importa en models, dao y la conexión (config/db.config.js)', () => {
    const permitidos = (n) => n.startsWith('models/') || n.startsWith('dao/') || n === 'config/db.config.js';
    const infractores = todos.filter((a) => !permitidos(a.nombre) && /from 'mongoose'/.test(a.codigo));
    assert.deepEqual(infractores.map((a) => a.nombre), []);
  });

  test('los services consumen repositories: nunca DAOs, modelos ni mongoose', () => {
    for (const s of archivosDe('services')) {
      assert.equal(importaDe(s.codigo, 'dao/'), false, `${s.nombre} importa un DAO`);
      assert.equal(importaDe(s.codigo, 'models/'), false, `${s.nombre} importa un modelo`);
      assert.equal(/from 'mongoose'/.test(s.codigo), false, `${s.nombre} importa mongoose`);
    }
  });

  test('los controllers solo coordinan request/response: no importan modelos, DAOs ni repositories', () => {
    for (const c of archivosDe('controllers')) {
      for (const capa of ['models/', 'dao/', 'repositories/']) {
        assert.equal(importaDe(c.codigo, capa), false, `${c.nombre} importa ${capa}`);
      }
      assert.equal(/from 'mongoose'/.test(c.codigo), false, `${c.nombre} importa mongoose`);
    }
  });

  test('los repositories no importan modelos ni DAOs: reciben el DAO por constructor', () => {
    for (const r of archivosDe('repositories')) {
      assert.equal(importaDe(r.codigo, 'models/'), false, `${r.nombre} importa un modelo`);
      assert.equal(importaDe(r.codigo, 'dao/'), false, `${r.nombre} importa un DAO`);
      assert.match(r.codigo, /constructor\(dao\)/, `${r.nombre} debe recibir el DAO por inyección`);
    }
  });

  test('los repositories entregan DTOs, nunca documentos crudos', () => {
    for (const r of archivosDe('repositories')) {
      assert.match(r.codigo, /from '\.\.\/dto\//, `${r.nombre} no usa ningún DTO`);
    }
  });

  test('los routers componen la cadena completa controller → service → repository → dao', () => {
    for (const nombre of ['events', 'users', 'tickets']) {
      const router = readFileSync(join(SRC, 'routes', `${nombre}.router.js`), 'utf8');
      assert.match(router, /new \w+Controller\(/, `${nombre}.router.js no construye el controller`);
      assert.match(router, /new \w+Repository\(new \w+Dao\(\)\)/, `${nombre}.router.js no inyecta Repository(Dao)`);
    }
  });

  test('sin console.log fuera del arranque, la conexión, la configuración, el manejador de errores y los scripts', () => {
    const permitidos = (n) => ['server.js', 'config/db.config.js', 'config/env.config.js', 'middlewares/error.middleware.js'].includes(n) || n.startsWith('scripts/');
    const infractores = todos.filter((a) => !permitidos(a.nombre) && /console\.log/.test(a.codigo));
    assert.deepEqual(infractores.map((a) => a.nombre), []);
  });
});

describe('DTOs: ninguna respuesta expone la contraseña', () => {
  const usuarioCrudo = { _id: '665f2a1b2c3d4e5f6a7b8c9d', first_name: 'Ana', last_name: 'Pérez', email: 'ana@mail.com', role: 'user', password: '$2b$10$hash', __v: 0, createdAt: new Date() };

  test('toUserDTO y toSessionDTO omiten password, __v y campos internos', () => {
    const publico = toUserDTO(usuarioCrudo);
    assert.deepEqual(publico, { id: '665f2a1b2c3d4e5f6a7b8c9d', first_name: 'Ana', last_name: 'Pérez', email: 'ana@mail.com', role: 'user' });
    assert.deepEqual(toSessionDTO(usuarioCrudo), { id: '665f2a1b2c3d4e5f6a7b8c9d', email: 'ana@mail.com', role: 'user' });
  });

  test('toTicketDTO filtra también el documento poblado: del usuario solo id, nombre y email', () => {
    const ticket = toTicketDTO({
      _id: '66a1', quantity: 1, status: 'confirmed', reservationCode: 'AUR-AAAAAAAA', createdAt: new Date(), cancelledAt: null,
      user: usuarioCrudo,
      event: { _id: '6690', title: 'Cata', date: new Date('2027-03-15T19:00:00Z'), location: 'Café Aurora', organizer: 'x', capacity: 10, status: 'published' },
    });
    assert.deepEqual(ticket.user, { id: '665f2a1b2c3d4e5f6a7b8c9d', first_name: 'Ana', last_name: 'Pérez', email: 'ana@mail.com' });
    assert.deepEqual(Object.keys(ticket.event).sort(), ['date', 'id', 'location', 'title']);
    assert.equal(JSON.stringify(ticket).includes('hash'), false);
    assert.equal(JSON.stringify(ticket).includes('role'), false);
  });

  test('toTicketDTO sin populate entrega las referencias como id en texto', () => {
    const ticket = toTicketDTO({ _id: '66a1', user: usuarioCrudo._id, event: '6690', quantity: 1, status: 'confirmed', reservationCode: 'AUR-AAAAAAAA' });
    assert.equal(ticket.user, '665f2a1b2c3d4e5f6a7b8c9d');
    assert.equal(ticket.event, '6690');
    assert.equal(ticket.cancelledAt, null);
  });

  test('toEventDTO no expone _id ni __v y entrega organizer como id', () => {
    const evento = toEventDTO({ _id: '6690', title: 'Cata', description: 'd', category: 'cata', date: new Date(), location: 'L', capacity: 1, price: 0, status: 'draft', organizer: { _id: '665f', email: 'x', password: 'h' }, __v: 3 });
    assert.equal(evento.organizer, '665f');
    assert.equal('__v' in evento, false);
    assert.equal('_id' in evento, false);
  });
});
