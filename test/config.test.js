import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const ejecutar = promisify(execFile);

// Arranca la configuración en un proceso aparte (hace process.exit en caso de error)
// e imprime el valor de jwtExpiresIn que recibiría jsonwebtoken.
async function cargarConfig(variables) {
  const env = { ...process.env, ...variables };
  try {
    const { stdout } = await ejecutar(
      process.execPath,
      ['--input-type=module', '-e', "import('./src/config/env.config.js').then((m) => console.log(JSON.stringify(m.default.jwtExpiresIn)))"],
      { env, cwd: new URL('..', import.meta.url) }
    );
    return { codigo: 0, valor: JSON.parse(stdout.trim()) };
  } catch (error) {
    return { codigo: error.code, salida: error.stderr };
  }
}

describe('Configuración de JWT_EXPIRES_IN', () => {
  test('un valor solo numérico se interpreta como segundos (Number), no como milisegundos', async () => {
    const { codigo, valor } = await cargarConfig({ JWT_EXPIRES_IN: '3600' });
    assert.equal(codigo, 0);
    assert.equal(valor, 3600);
  });

  test('una duración con unidad se conserva como texto', async () => {
    const { valor } = await cargarConfig({ JWT_EXPIRES_IN: ' 15m ' });
    assert.equal(valor, '15m');
  });

  test('sin valor usa 1h por defecto', async () => {
    const { valor } = await cargarConfig({ JWT_EXPIRES_IN: '' });
    assert.equal(valor, '1h');
  });

  test('rechaza valores inválidos o cero y detiene el arranque', async () => {
    for (const invalido of ['0', '0h', '1x', 'una hora']) {
      const { codigo, salida } = await cargarConfig({ JWT_EXPIRES_IN: invalido });
      assert.equal(codigo, 1, `debe fallar con "${invalido}"`);
      assert.match(salida, /JWT_EXPIRES_IN/);
    }
  });

  test('sin JWT_SECRET no arranca', async () => {
    const { codigo, salida } = await cargarConfig({ JWT_SECRET: '' });
    assert.equal(codigo, 1);
    assert.match(salida, /JWT_SECRET/);
  });
});
