// Se carga antes de cada archivo de tests (node --import). Garantiza una
// configuración mínima para que la app arranque aunque no exista un .env:
// la base real no se usa, los tests levantan MongoDB en memoria (ver setup.js).
process.env.NODE_ENV = 'test';
process.env.PORT ??= '8080';
process.env.MONGO_URL ??= 'mongodb://127.0.0.1:27017/cafe_aurora_eventos_test';
process.env.JWT_SECRET ??= 'secreto-exclusivo-para-la-suite-de-tests';
process.env.JWT_EXPIRES_IN ??= '1h';
