import config from '../config/env.config.js';
import { conectarDB, desconectarDB } from '../config/db.config.js';
import EventsDao from '../dao/events.dao.js';
import EventsRepository from '../repositories/events.repository.js';
import TicketsDao from '../dao/tickets.dao.js';
import TicketsRepository from '../repositories/tickets.repository.js';

// Script de mantenimiento: deja el contador interno de lugares reservados de cada evento
// (seatsTaken) igual a la suma de lugares de sus tickets activos.
//
//   pnpm recalcular-cupos        (con npm: npm run recalcular-cupos)
//
// Hace falta en dos casos: una base con inscripciones anteriores a la existencia del contador, o
// un servidor que se cayó justo entre reservar el cupo y crear el ticket. Es idempotente y conviene
// correrlo sin inscripciones en curso. Usa la misma MONGO_URL del .env.

const eventsRepository = new EventsRepository(new EventsDao());
const ticketsRepository = new TicketsRepository(new TicketsDao());
const LIMITE = 50;

try {
  await conectarDB();
  console.log(`Base: ${config.mongoUrl.replace(/\/\/[^/]*@/, '//***@')}`);

  let revisados = 0;
  for (let page = 1; ; page++) {
    const { data, total } = await eventsRepository.buscar({}, { page, limit: LIMITE, orden: { date: 1 } });
    for (const evento of data) {
      const ocupados = await ticketsRepository.contarCuposOcupados(evento.id);
      await eventsRepository.fijarCuposReservados(evento.id, ocupados);
      revisados += 1;
      console.log(`Evento ${evento.title.padEnd(40)} ${ocupados} de ${evento.capacity} lugares reservados`);
    }
    if (page * LIMITE >= total) break;
  }
  console.log(`\nContadores recalculados en ${revisados} eventos.`);
} catch (error) {
  console.error(`No fue posible recalcular los cupos: ${error.message}`);
  process.exitCode = 1;
} finally {
  await desconectarDB();
}
