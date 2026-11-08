import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

// Base de datos en memoria para los tests: no requiere MongoDB instalado ni Atlas.
let mongod;

export async function iniciarBaseDePrueba() {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  // Los índices (en especial el único parcial de Ticket) deben existir antes del primer insert:
  // Mongoose los crea en segundo plano y un test rápido podría adelantarse.
  await Promise.all(mongoose.modelNames().map((nombre) => mongoose.model(nombre).init()));
}

export async function limpiarBaseDePrueba() {
  const colecciones = await mongoose.connection.db.collections();
  await Promise.all(colecciones.map((coleccion) => coleccion.deleteMany({})));
}

export async function detenerBaseDePrueba() {
  await mongoose.disconnect();
  await mongod.stop();
}
