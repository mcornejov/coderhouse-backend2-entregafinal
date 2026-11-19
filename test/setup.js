import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

// Base de datos en memoria para los tests: no requiere MongoDB instalado ni Atlas.
// `pnpm test` levanta una sola instancia para toda la suite (ver run.js) y la informa en
// MONGO_TEST_URI; cada archivo de test corre en su propio proceso y usa una base de datos propia
// dentro de esa instancia, así que los archivos no se pisan los datos entre sí.
// Si la variable no existe (un archivo ejecutado suelto con `node --test`), se levanta una
// instancia solo para ese archivo.
let mongodPropio = null;

export async function iniciarBaseDePrueba() {
  let uri = process.env.MONGO_TEST_URI;
  if (!uri) {
    mongodPropio = await MongoMemoryServer.create();
    uri = mongodPropio.getUri();
  }
  await mongoose.connect(uri, { dbName: `cafe_aurora_test_${process.pid}` });
  // Los índices (en especial el único parcial de Ticket) deben existir antes del primer insert:
  // Mongoose los crea en segundo plano y un test rápido podría adelantarse.
  await Promise.all(mongoose.modelNames().map((nombre) => mongoose.model(nombre).init()));
}

export async function limpiarBaseDePrueba() {
  const colecciones = await mongoose.connection.db.collections();
  await Promise.all(colecciones.map((coleccion) => coleccion.deleteMany({})));
}

export async function detenerBaseDePrueba() {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  if (mongodPropio) {
    await mongodPropio.stop();
    mongodPropio = null;
  }
}
