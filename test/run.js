import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoMemoryServer } from 'mongodb-memory-server';

// Lanzador de la suite (`pnpm test`). Levanta UNA sola instancia de MongoDB en memoria y recién
// después ejecuta los archivos de test, que la comparten usando cada uno su propia base de datos
// (ver setup.js). Así el binario de MongoDB se descarga y descomprime una única vez, antes de que
// exista concurrencia: si cada archivo levantara su propia instancia, en una máquina sin el binario
// en caché varios procesos lo descomprimirían a la vez y fallarían con ETXTBSY.
const carpeta = path.dirname(fileURLToPath(import.meta.url));

// Sin argumentos corre toda la suite; con argumentos, solo esos archivos.
const archivos = process.argv.slice(2);
if (archivos.length === 0) {
  const todos = readdirSync(carpeta).filter((nombre) => nombre.endsWith('.test.js')).sort();
  archivos.push(...todos.map((nombre) => path.join(carpeta, nombre)));
}

const mongod = await MongoMemoryServer.create();

const suite = spawn(
  process.execPath,
  ['--import', path.join(carpeta, 'env.js'), '--test', ...archivos],
  { stdio: 'inherit', env: { ...process.env, MONGO_TEST_URI: mongod.getUri() } },
);

const detener = async (codigo) => {
  await mongod.stop();
  process.exit(codigo);
};

suite.on('error', () => detener(1));
suite.on('close', (codigo) => detener(codigo ?? 1));
