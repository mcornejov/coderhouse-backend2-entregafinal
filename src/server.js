import config from './config/env.config.js';
import { conectarDB } from './config/db.config.js';
import app from './app.js';

// Punto de entrada: conecta la base de datos y levanta el servidor
async function iniciar() {
  try {
    await conectarDB();

    app.listen(config.port, () => {
      console.log(`Servidor escuchando en http://localhost:${config.port} (${config.nodeEnv})`);
    });
  } catch (error) {
    console.error('No fue posible iniciar el servidor:', error.message);
    console.error('Revisa que MONGO_URL apunte a una base de datos accesible (ver .env.example).');
    process.exit(1);
  }
}

iniciar();
