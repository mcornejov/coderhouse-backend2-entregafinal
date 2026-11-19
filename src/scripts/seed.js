import config from '../config/env.config.js';
import { conectarDB, desconectarDB } from '../config/db.config.js';
import UsersDao from '../dao/users.dao.js';
import UsersRepository from '../repositories/users.repository.js';
import UsersService from '../services/users.service.js';
import EventsDao from '../dao/events.dao.js';
import EventsRepository from '../repositories/events.repository.js';
import EventsService from '../services/events.service.js';
import { hashPassword } from '../utils/hash.js';
import { PASSWORD_MIN_LENGTH, isPasswordTooLong } from '../utils/validators.js';
import { ROLES } from '../config/roles.config.js';
import { ESTADOS_EVENTO } from '../config/events.config.js';

// Datos de prueba para instalar y probar la API en minutos: un admin, un organizer y dos
// usuarios, más ocho eventos del organizer (siete publicados, uno en borrador): suficientes
// para que el listado paginado con limit=5 tenga una segunda página con datos.
//
//   pnpm seed            (con npm: npm run seed)
//
// Es idempotente: si un usuario o un evento ya existe, lo deja como está (solo termina de publicar
// un evento que haya quedado en borrador por una ejecución interrumpida). Nunca borra nada.
// Pasa por las mismas capas que la API (service → repository → dao); la única excepción es la
// creación de usuarios, que en la API vive en la estrategia `register` de Passport: aquí se
// hashea la contraseña con el mismo utils/hash.js y se guarda por el repositorio.

// Se puede cambiar con SEED_PASSWORD; el valor por defecto es el documentado en el README
export const PASSWORD_PRUEBA = process.env.SEED_PASSWORD || 'Aurora2026!';

export const USUARIOS_PRUEBA = [
  { first_name: 'Ana', last_name: 'Admin', email: 'ana@cafeaurora.cl', role: ROLES.ADMIN },
  { first_name: 'Bruno', last_name: 'Barista', email: 'bruno@cafeaurora.cl', role: ROLES.ORGANIZER },
  { first_name: 'Carla', last_name: 'Cliente', email: 'carla@cafeaurora.cl', role: ROLES.USER },
  { first_name: 'Diego', last_name: 'Cliente', email: 'diego@cafeaurora.cl', role: ROLES.USER },
];

// Fechas relativas a hoy para que los eventos siempre sean futuros
function enDias(dias, hora = 19) {
  const fecha = new Date();
  fecha.setUTCDate(fecha.getUTCDate() + dias);
  fecha.setUTCHours(hora, 0, 0, 0);
  return fecha.toISOString();
}

export const EVENTOS_PRUEBA = [
  { title: 'Cata de cafés de Colombia', description: 'Recorrido por tres orígenes con método V60.', category: 'cata', date: enDias(30), location: 'Café Aurora, Providencia', capacity: 12, price: 15000, publicar: true },
  { title: 'Taller de latte art', description: 'Técnica de vaporizado y vertido para principiantes.', category: 'workshop', date: enDias(45, 18), location: 'Café Aurora, Providencia', capacity: 8, price: 20000, publicar: true },
  { title: 'Charla con productores de Ñuble', description: 'Conversatorio sobre cosecha y comercio justo.', category: 'charla', date: enDias(60, 20), location: 'Café Aurora, Ñuñoa', capacity: 2, price: 0, publicar: true },
  { title: 'Cata de cafés de Etiopía', description: 'Perfiles florales y frutales en filtrado.', category: 'cata', date: enDias(37), location: 'Café Aurora, Providencia', capacity: 10, price: 15000, publicar: true },
  { title: 'Taller de métodos de filtrado', description: 'V60, Chemex y AeroPress en una tarde.', category: 'workshop', date: enDias(52, 17), location: 'Café Aurora, Ñuñoa', capacity: 6, price: 25000, publicar: true },
  { title: 'Charla: café y comercio justo', description: 'Cómo llega el precio a la finca.', category: 'charla', date: enDias(67, 20), location: 'Café Aurora, Providencia', capacity: 25, price: 0, publicar: true },
  { title: 'Noche de bossa nova', description: 'Dúo de guitarra y voz.', category: 'musica', date: enDias(75, 21), location: 'Café Aurora, Ñuñoa', capacity: 30, price: 8000, publicar: true },
  { title: 'Noche de jazz (borrador)', description: 'Trío en vivo. Fecha por confirmar.', category: 'musica', date: enDias(90, 21), location: 'Café Aurora, Ñuñoa', capacity: 40, price: 8000, publicar: false },
];

const usersDao = new UsersDao();
const usersRepository = new UsersRepository(usersDao);
const usersService = new UsersService(usersRepository);
const eventsRepository = new EventsRepository(new EventsDao());
const eventsService = new EventsService(eventsRepository);

async function asegurarUsuario(datos) {
  const existente = await usersDao.findByEmail(datos.email);
  if (existente) {
    if (existente.role !== datos.role) {
      await usersService.asignarRol(existente._id.toString(), datos.role);
      return { usuario: { id: existente._id.toString(), ...datos }, estado: `rol actualizado a ${datos.role}` };
    }
    return { usuario: { id: existente._id.toString(), ...datos }, estado: 'ya existía' };
  }
  const creado = await usersRepository.create({
    first_name: datos.first_name,
    last_name: datos.last_name,
    email: datos.email,
    password: await hashPassword(PASSWORD_PRUEBA),
  });
  if (datos.role !== ROLES.USER) {
    await usersService.asignarRol(creado.id, datos.role);
  }
  return { usuario: { id: creado.id, ...datos }, estado: 'creado' };
}

// Busca el evento del organizer por título recorriendo todas las páginas de su categoría
async function buscarEvento(contenido, organizer) {
  const limit = 50;
  for (let page = 1; ; page++) {
    const { data, total } = await eventsRepository.buscar({ category: contenido.category }, { page, limit, orden: { date: 1 } });
    const encontrado = data.find((e) => e.title === contenido.title && e.organizer === organizer.id);
    if (encontrado || page * limit >= total) return encontrado ?? null;
  }
}

async function asegurarEvento(datos, organizer) {
  const { publicar, ...contenido } = datos;
  const solicitante = { id: organizer.id, role: organizer.role };
  const existente = await buscarEvento(contenido, organizer);
  if (existente) {
    // Una ejecución anterior pudo cortarse entre crear y publicar
    if (publicar && existente.status === ESTADOS_EVENTO.DRAFT) {
      await eventsService.cambiarEstado(existente.id, { status: ESTADOS_EVENTO.PUBLISHED }, solicitante);
      return 'ya existía (publicado ahora)';
    }
    return 'ya existía';
  }
  const creado = await eventsService.crear(contenido, solicitante);
  if (publicar) {
    await eventsService.cambiarEstado(creado.id, { status: ESTADOS_EVENTO.PUBLISHED }, solicitante);
    return 'creado y publicado';
  }
  return 'creado (draft)';
}

try {
  // Misma regla que el registro: con una contraseña más corta o más larga no se podría iniciar sesión
  if (PASSWORD_PRUEBA.length < PASSWORD_MIN_LENGTH || isPasswordTooLong(PASSWORD_PRUEBA)) {
    throw new Error(`SEED_PASSWORD debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres y no superar los 72 bytes`);
  }
  await conectarDB();
  console.log(`Base: ${config.mongoUrl.replace(/\/\/[^/]*@/, '//***@')}`);

  const usuarios = [];
  let creados = 0;
  for (const datos of USUARIOS_PRUEBA) {
    const { usuario, estado } = await asegurarUsuario(datos);
    usuarios.push(usuario);
    if (estado === 'creado') creados += 1;
    console.log(`Usuario ${usuario.email.padEnd(22)} ${usuario.role.padEnd(9)} ${estado}`);
  }

  const organizer = usuarios.find((u) => u.role === ROLES.ORGANIZER);
  for (const datos of EVENTOS_PRUEBA) {
    const estado = await asegurarEvento(datos, organizer);
    console.log(`Evento  ${datos.title.padEnd(40)} ${estado}`);
  }

  if (creados === USUARIOS_PRUEBA.length) {
    console.log(`\nContraseña de todos los usuarios de prueba: ${PASSWORD_PRUEBA}`);
  } else if (creados > 0) {
    console.log(`\nContraseña de los usuarios creados ahora: ${PASSWORD_PRUEBA} (los que ya existían conservan la suya)`);
  } else {
    console.log('\nLos usuarios ya existían y conservan su contraseña (por defecto, la documentada en el README).');
  }
  console.log('Inicia sesión con POST /api/sessions/login y sigue el flujo del README.');
} catch (error) {
  console.error(`No fue posible cargar los datos de prueba: ${error.message}`);
  process.exitCode = 1;
} finally {
  await desconectarDB();
}
