# Café Aurora · Plataforma de Eventos e Inscripciones

Proyecto de **Backend II** de CoderHouse: una API REST con Express organizada por capas y
persistencia en MongoDB, que crece entrega a entrega hacia una plataforma completa de eventos
con autenticación, roles, inscripciones y control de cupos.

**Entrega final.** Esta es la versión completa e integrada de la API: la evolución de las ocho
pre-entregas en un solo repositorio, con todas sus funcionalidades y la arquitectura por capas que
las sostiene. No es un proyecto nuevo: cada módulo del curso agregó una pieza sobre la anterior.

| Entrega | Módulo | Qué sumó | Repositorio |
|---------|--------|----------|-------------|
| PE1 | Repaso arquitectónico | Express 5 por capas, `/api/health`, modelos base, variables de entorno con Fail-Fast | [preentrega1](https://github.com/mcornejov/coderhouse-backend2-preentrega1) |
| PE2 | Registro seguro | `POST /api/sessions/register`, bcrypt, DTO de usuario sin contraseña, `409` por email repetido | [preentrega2](https://github.com/mcornejov/coderhouse-backend2-preentrega2) |
| PE3 | Login, JWT y cookies | Login con JWT en cookie `httpOnly`, `GET /current`, logout, middleware de autenticación | [preentrega3](https://github.com/mcornejov/coderhouse-backend2-preentrega3) |
| PE4 | Passport | Estrategias `register`, `login` y `current` en `config/passport.config.js` | [preentrega4](https://github.com/mcornejov/coderhouse-backend2-preentrega4) |
| PE5 | Roles y autorización | Matriz `PERMISOS`, `authorize(...roles)`, 401 vs 403, propiedad de recursos, `/api/users` | [preentrega5](https://github.com/mcornejov/coderhouse-backend2-preentrega5) |
| PE6 | Eventos | `Event` completo, estados y transiciones, reglas de negocio, listado paginado con filtros | [preentrega6](https://github.com/mcornejov/coderhouse-backend2-preentrega6) |
| PE7 | Tickets | `Ticket` con referencias, control de cupos, cancelación lógica, correo con Nodemailer | [preentrega7](https://github.com/mcornejov/coderhouse-backend2-preentrega7) |
| PE8 | DAO, Repository y DTO | Arquitectura formalizada y vigilada por tests; repositories con métodos de dominio | [preentrega8](https://github.com/mcornejov/coderhouse-backend2-preentrega8) |
| **Final** | Integración | Usuarios de prueba (`pnpm seed`), colección de Postman, correo también al cancelar, los 10 casos del flujo completo automatizados | este repositorio |

**Qué incluye la API**

- **Autenticación**: registro con bcrypt, login con JWT en cookie `httpOnly`, `/current`, logout;
  Passport con estrategias `register`, `login` y `current`. Ninguna respuesta ni el JWT contienen la contraseña.
- **Roles y autorización**: `user` (por defecto), `organizer`, `admin`; `401` sin sesión, `403` sin
  permiso; propiedad de recursos verificada en los services (eventos del organizador, tickets del usuario).
- **Eventos**: modelo completo, `POST/GET/GET :id/PUT :id/PATCH :id/status`, transiciones
  `draft → published → finished` y cancelación como estado, fecha futura, `capacity > 0`, `price ≥ 0`,
  listado siempre paginado con filtros por estado, categoría, lugar y rango de fechas, y orden.
- **Inscripciones**: `Ticket` con referencias a usuario y evento, cupo = capacidad menos tickets
  activos (los cancelados no cuentan), sin duplicados activos, sin sobreventa bajo concurrencia,
  `my-tickets` con el evento poblado, inscritos por evento para su organizador, cancelación lógica.
- **Notificaciones**: correo con Nodemailer al confirmar y al cancelar una inscripción, credenciales
  solo en variables de entorno; sin `MAIL_HOST` los correos se registran en consola.
- **Arquitectura**: `routes → controllers → services → repositories → dao → models`, DTOs en usuario,
  evento y ticket, middleware centralizado de errores (`400/401/403/404/409/413/500`), reglas de
  dependencia verificadas por tests.
- **Calidad**: 195 tests con MongoDB en memoria, datos de prueba con un comando, colección de Postman
  con el flujo completo.

## Índice

- [Temática elegida](#temática-elegida)
- [Tecnologías](#tecnologías)
- [Instalación](#instalación)
- [Configuración de variables de entorno](#configuración-de-variables-de-entorno)
- [Cómo ejecutar](#cómo-ejecutar)
- [Usuarios de prueba](#usuarios-de-prueba)
- [Arquitectura en capas](#arquitectura-en-capas)
- [Roles y matriz de permisos](#roles-y-matriz-de-permisos)
  - [Primer admin](#primer-admin)
- [Estrategias de Passport](#estrategias-de-passport)
- [Eventos: modelo, estados y reglas de negocio](#eventos-modelo-estados-y-reglas-de-negocio)
  - [Estados y transiciones](#estados-y-transiciones)
  - [Reglas de negocio (en `events.service.js`)](#reglas-de-negocio-en-eventsservicejs)
- [Inscripciones (tickets): modelo, cupos, cancelación y correo](#inscripciones-tickets-modelo-cupos-cancelación-y-correo)
  - [Flujo de inscripción (`POST /api/events/:eid/tickets`)](#flujo-de-inscripción-post-apieventseidtickets)
  - [Regla de cupos](#regla-de-cupos)
- [Rutas disponibles](#rutas-disponibles)
- [Cómo probarlo](#cómo-probarlo)
  - [Colección de Postman](#colección-de-postman)
  - [Los 10 casos del flujo completo](#los-10-casos-del-flujo-completo)
  - [Flujo de roles (casos de la consigna)](#flujo-de-roles-casos-de-la-consigna)
  - [Flujo de eventos (casos de la consigna)](#flujo-de-eventos-casos-de-la-consigna)
  - [Flujo de inscripciones (casos de la consigna)](#flujo-de-inscripciones-casos-de-la-consigna)
  - [Suite de tests](#suite-de-tests)
- [Decisiones de diseño de los eventos](#decisiones-de-diseño-de-los-eventos)
- [Decisiones de diseño de las inscripciones](#decisiones-de-diseño-de-las-inscripciones)
- [Decisiones de seguridad](#decisiones-de-seguridad)
- [Estructura de carpetas](#estructura-de-carpetas)
  - [Flujo de la autenticación](#flujo-de-la-autenticación)
  - [Flujo de la autorización](#flujo-de-la-autorización)
- [Modelos](#modelos)
- [Fuera del alcance y próximos pasos](#fuera-del-alcance-y-próximos-pasos)

## Temática elegida

**Café Aurora** es una cafetería de especialidad (marca que acompaña todos mis proyectos de la
carrera Fullstack) que organiza eventos para su comunidad: catas de café, talleres de barismo,
charlas con productores y noches de música en vivo. La plataforma permitirá publicar esos eventos
y gestionar las inscripciones de los clientes.

## Tecnologías

| Tecnología | Uso |
|------------|-----|
| Node.js (>= 20.19) | Entorno de ejecución, módulos ESM |
| Express 5 | Servidor HTTP y enrutamiento |
| MongoDB + Mongoose | Persistencia y modelos (`User`, `Event`, `Ticket`) |
| Passport (`passport`, `passport-local`, `passport-jwt`) | Estrategias de autenticación `register`, `login` y `current` |
| bcrypt | Hash y comparación de contraseñas |
| jsonwebtoken | Firma del JWT (la verificación la hace `passport-jwt`) |
| cookie-parser | Lectura de la cookie de sesión |
| Nodemailer | Correos de confirmación y de cancelación de inscripción (SMTP por variables de entorno) |
| dotenv | Variables de entorno |
| node:test + supertest + mongodb-memory-server | Tests de integración con base en memoria |
| pnpm | Gestor de paquetes |

## Instalación

```bash
git clone https://github.com/mcornejov/coderhouse-backend2-entregafinal.git
cd coderhouse-backend2-entregafinal
pnpm install
```

> Si no usas pnpm, `npm install` también funciona.

## Configuración de variables de entorno

Copia el archivo de ejemplo y ajusta los valores:

```bash
cp .env.example .env
```

El ejemplo deja `MAIL_HOST` vacío a propósito: así la API arranca y se prueba completa sin cuenta de
correo, y cada correo se arma y se **registra en la consola del servidor** en vez de enviarse. Para
verlo llegar a un buzón real, completa las variables `MAIL_*` (Ethereal entrega credenciales de prueba
en un minuto; ver la tabla).

| Variable | Descripción | Obligatoria |
|----------|-------------|-------------|
| `PORT` | Puerto donde escucha el servidor | Sí |
| `NODE_ENV` | Entorno: `development`, `production` o `test`. En `production` la cookie se marca `secure` | Sí |
| `MONGO_URL` | Cadena de conexión a MongoDB (Atlas o local). Sin ella el servidor no arranca | Sí |
| `JWT_SECRET` | Secreto con el que se firman (controller) y verifican (estrategia `current`) los JWT. Usa un valor largo y aleatorio | Sí |
| `JWT_EXPIRES_IN` | Expiración del JWT: número de segundos (`3600`) o duración con unidad (`15m`, `1h`, `7d`). Por defecto `1h` | No |
| `BCRYPT_SALT_ROUNDS` | Costo del hash de bcrypt, entre 10 y 14 (por defecto 10) | No |
| `MAIL_HOST` | Servidor SMTP para los correos (`smtp.ethereal.email`, `smtp.gmail.com`, Mailtrap...). **Vacío por defecto**: el servidor arranca igual y los correos se registran en consola en vez de enviarse | No |
| `MAIL_PORT` | Puerto SMTP: `587` (STARTTLS, por defecto) o `465` (TLS) | No |
| `MAIL_USER`, `MAIL_PASS` | Credenciales SMTP. Con Gmail, `MAIL_PASS` es una "contraseña de aplicación". **Nunca van en el código** | No |
| `MAIL_FROM` | Remitente que ve el usuario (`"Café Aurora <no-reply@cafeaurora.cl>"`). Por defecto `MAIL_USER` | No |

El servidor valida la configuración al arrancar (Fail-Fast): si falta una variable obligatoria o
`PORT`/`JWT_EXPIRES_IN` tienen un valor inválido, se detiene con un mensaje claro en vez de
servir una API rota. El secreto **nunca está en el código**: solo se lee de `process.env`.

El archivo `.env` y la carpeta `node_modules/` están excluidos del repositorio mediante
`.gitignore`: nunca se versionan credenciales ni dependencias instaladas. Las credenciales reales
(URI de Atlas, secreto del JWT) viven solo en el `.env` local de cada entorno.

## Cómo ejecutar

```bash
pnpm start      # producción: node src/server.js
pnpm dev        # desarrollo: reinicia automáticamente al guardar cambios
pnpm test       # suite de tests (usa MongoDB en memoria, no necesita base instalada)
pnpm seed       # carga usuarios y eventos de prueba en la base del .env (ver "Usuarios de prueba")
pnpm asignar-rol <email> <rol>      # asigna un rol a un usuario registrado (ver "Primer admin")
```

Con la configuración por defecto el servidor queda disponible en `http://localhost:8080`.

## Usuarios de prueba

La forma rápida: con el `.env` configurado (al menos `MONGO_URL`), ejecuta

```bash
pnpm seed
```

Crea, si no existen, cuatro usuarios y ocho eventos del organizador (siete publicados y un
borrador: así `?status=published&page=2&limit=5` devuelve una segunda página con datos). Es
idempotente (volver a correrlo no duplica ni borra nada) y pasa por las mismas capas que la API. La
contraseña de prueba se puede cambiar con la variable `SEED_PASSWORD` antes de correrlo.

| Email | Rol | Contraseña | Para qué sirve |
|-------|-----|------------|----------------|
| `ana@cafeaurora.cl` | `admin` | `Aurora2026!` | Modificar cualquier evento, ver y cambiar roles en `/api/users` |
| `bruno@cafeaurora.cl` | `organizer` | `Aurora2026!` | Dueño de los eventos de prueba: crear, publicar, ver inscritos |
| `carla@cafeaurora.cl` | `user` | `Aurora2026!` | Inscribirse, ver sus tickets, cancelar |
| `diego@cafeaurora.cl` | `user` | `Aurora2026!` | Segundo usuario para duplicados, cupos y tickets ajenos |

| Evento (de bruno) | Categoría | Cupo | Estado | Para qué sirve |
|-------------------|-----------|:----:|--------|----------------|
| Cata de cafés de Colombia | `cata` | 12 | `published` | Inscripciones normales |
| Taller de latte art | `workshop` | 8 | `published` | Filtro `?category=workshop` |
| Charla con productores de Ñuble | `charla` | 2 | `published` | Probar "sin cupo" con pocos usuarios |
| Cata de cafés de Etiopía | `cata` | 10 | `published` | Segunda cata para filtros y paginación |
| Taller de métodos de filtrado | `workshop` | 6 | `published` | Segundo workshop |
| Charla: café y comercio justo | `charla` | 25 | `published` | Evento gratuito (`price: 0`) |
| Noche de bossa nova | `musica` | 30 | `published` | Filtro `?category=musica` |
| Noche de jazz (borrador) | `musica` | 40 | `draft` | Inscribirse a un borrador → `409`; publicarlo con bruno |

Las fechas de los eventos se calculan al correr el seed (30 a 90 días en el futuro), así nunca quedan
en el pasado.

La forma manual, sin seed: registra usuarios con `POST /api/sessions/register` (siempre nacen `user`),
convierte al primero en admin con `pnpm asignar-rol <email> admin` y, ya con sesión de admin, asigna
`organizer` a quien corresponda con `PATCH /api/users/:uid/role` (ver [Primer admin](#primer-admin)
y el [flujo de roles](#flujo-de-roles-casos-de-la-consigna)).

## Arquitectura en capas

```
HTTP ──► routes ──► controllers ──► services ──► repositories ──► dao ──► models (Mongoose) ──► MongoDB
                                       │               │
                                       │               └── dto: forma pública de cada entidad
                                       └── errors.util: HttpError 400/401/403/404/409 → error.middleware
```

| Capa | Responsabilidad | Puede importar | Nunca importa | Archivos |
|------|-----------------|----------------|---------------|----------|
| **routes** | Declarar rutas y middlewares (`auth`, `authorize`) y **componer** la cadena: `new Controller(new Service(new Repository(new Dao())))` | controllers, services, repositories, dao, middlewares, config | models | `src/routes/*.router.js` |
| **controllers** | Coordinar request/response: extraer `body`/`params`/`query`/`req.user`, llamar al service, responder con el helper uniforme; los errores van a `next` | utils/responses | models, dao, repositories, mongoose | `src/controllers/*.controller.js` |
| **services** | **Toda la lógica de negocio**: validaciones de contenido, fecha futura, estados y transiciones, cupos, duplicados, propiedad del recurso (organizer dueño / dueño del ticket / admin), envío del correo. Lanzan `HttpError` con el código correcto | repositories (por inyección), config, utils | dao, models, mongoose | `src/services/*.service.js` |
| **repositories** | Intermediario orientado al dominio: reciben el DAO por constructor, traducen cada resultado a **DTO** y ofrecen operaciones con nombre de negocio (`findCredentialsByEmail`, `existsByEmail`, `buscar` paginado, `actualizarSiModificable`, `cambiarEstado`, `findActiveByUserAndEvent`, `contarCuposOcupados`, `cancelar`) | dto, config | models, dao (los reciben, no los importan), mongoose | `src/repositories/*.repository.js` |
| **dao** | **Único acceso a Mongoose**: `create`, `findById`, `findOne`, `find` + `countDocuments`, `findOneAndUpdate` condicional, `aggregate`, `populate`. Traducen criterios neutros a `$regex`/`$gte`/`$in`. Devuelven objetos planos (`lean`) | models, mongoose | nada de capas superiores | `src/dao/*.dao.js` |
| **models** | Esquemas de Mongoose: tipos, obligatorios, `enum`, rangos, índices. Segunda barrera detrás del servicio | config (enums) | — | `src/models/*.js` |
| **dto** | Qué sale de la capa de datos: `toUserDTO`, `toSessionDTO`, `toEventDTO`, `toTicketDTO`. Convierten `ObjectId` a texto, omiten `_id`/`__v`, **nunca incluyen `password`** y, si la consulta pobló una referencia, filtran también el documento relacionado | — | — | `src/dto/*.dto.js` |
| **middlewares** | `auth` (Passport `current` → `req.user` o `401`), `authorize(...roles)` (`403`), `notFound`, `errorHandler` (traduce `HttpError`, errores del parser, `ValidationError`, `CastError`, E11000 → 400/401/403/404/409/413/500 con `{ status: 'error', message }`) | utils, config | models, dao | `src/middlewares/*.js` |
| **config** | Entorno (Fail-Fast), conexión, Passport, roles y matriz `PERMISOS`, estados de evento y ticket, correo | repositories/dao solo en `passport.config.js` (raíz de composición de las estrategias) | — | `src/config/*.js` |

**Raíces de composición.** La cadena se arma en un solo lugar por recurso: cada router. Además
`config/passport.config.js` arma `new UsersRepository(new UsersDao())` para las estrategias y
`scripts/asignar-rol.js` arma la cadena de usuarios para la línea de comandos. Son los únicos puntos
fuera de `routes/` que conocen un DAO, y solo para construirlo.

**Una entidad, una cadena.** `users`, `events` y `tickets` tienen cada uno su DAO, su repository, su
service y su controller (`src/<capa>/<entidad>.<capa>.js`), y hay un DTO por entidad (`user`, `event`,
`ticket`). `sessions` no tiene DAO propio: registro, login y current son estrategias de Passport que
consumen `UsersRepository` (ver [Estrategias de Passport](#estrategias-de-passport)).

**Reglas vigiladas por tests.** `test/architecture.test.js` lee el código de `src/` y falla si:
alguien fuera de `dao/` importa un modelo; `mongoose` aparece fuera de `models/`, `dao/` y
`config/db.config.js`; un service importa un DAO o un modelo; un controller importa un modelo, un DAO o
un repository; un repository importa un modelo o un DAO, no recibe el DAO por constructor o no usa un
DTO; un router no compone `Repository(new Dao())`; o hay `console.log` fuera del arranque, la
configuración, el manejador de errores y los scripts. También verifica que los cuatro DTOs omiten
`password`, `__v` y `_id`, y que `toTicketDTO` filtra el usuario poblado (solo `id`, nombre y email).

**Por qué así.** Cambiar de MongoDB a otra base es reescribir `dao/` (y `models/`) sin tocar reglas
de negocio ni rutas. Cambiar qué se expone de un usuario es tocar `dto/user.dto.js`. Probar una regla
de negocio es instanciar el service con un repository falso, sin HTTP ni base: así están probados la
carrera de cupos, el `409` por cambio de estado concurrente y el orden persistir → correo.

## Roles y matriz de permisos

Los roles y la matriz viven en un solo archivo, `src/config/roles.config.js`; el modelo `User`
los usa como `enum`, los routers los pasan al middleware `authorize(...)` y nada más en el código
compara roles a mano.

| Rol | Quién es | Cómo se obtiene |
|-----|----------|-----------------|
| `user` | Cliente de la cafetería que se inscribe a eventos | Rol **por defecto** de todo registro público. El campo `role` del body se ignora |
| `organizer` | Personal de Café Aurora que organiza catas, talleres y charlas | Un `admin` lo asigna con `PATCH /api/users/:uid/role` |
| `admin` | Administración de la plataforma | Igual que `organizer`, o con `pnpm asignar-rol` para el primer admin de una instalación |

| Acción | Ruta | `user` | `organizer` | `admin` | Sin sesión |
|--------|------|:------:|:-----------:|:-------:|:----------:|
| Consultar eventos (listado paginado con filtros y detalle) | `GET /api/events`, `GET /api/events/:eid` | ✅ | ✅ | ✅ | ✅ |
| Ver la propia sesión | `GET /api/sessions/current` | ✅ | ✅ | ✅ | ❌ 401 |
| Crear eventos | `POST /api/events` | ❌ 403 | ✅ | ✅ | ❌ 401 |
| Modificar eventos **propios** | `PUT /api/events/:eid` | ❌ 403 | ✅ | ✅ | ❌ 401 |
| Publicar / cancelar / finalizar eventos **propios** | `PATCH /api/events/:eid/status` | ❌ 403 | ✅ | ✅ | ❌ 401 |
| Modificar o cambiar el estado de **cualquier** evento | `PUT`, `PATCH .../status` | ❌ 403 | ❌ 403 | ✅ | ❌ 401 |
| Ver todos los usuarios | `GET /api/users` | ❌ 403 | ❌ 403 | ✅ | ❌ 401 |
| Asignar roles | `PATCH /api/users/:uid/role` | ❌ 403 | ❌ 403 | ✅ | ❌ 401 |
| Inscribirse a un evento publicado | `POST /api/events/:eid/tickets` | ✅ | ✅ | ✅ | ❌ 401 |
| Ver mis inscripciones | `GET /api/tickets/my-tickets` | ✅ | ✅ | ✅ | ❌ 401 |
| Cancelar una inscripción **propia** | `PATCH /api/tickets/:tid/cancel` | ✅ | ✅ | ✅ | ❌ 401 |
| Cancelar **cualquier** inscripción | `PATCH /api/tickets/:tid/cancel` | ❌ 403 | ❌ 403 | ✅ | ❌ 401 |
| Ver los inscritos de un evento **propio** | `GET /api/events/:eid/tickets` | ❌ 403 | ✅ | ✅ | ❌ 401 |
| Ver los inscritos de **cualquier** evento | `GET /api/events/:eid/tickets` | ❌ 403 | ❌ 403 | ✅ | ❌ 401 |

En código la matriz es `PERMISOS`: `acción → roles permitidos`. Las acciones sin entrada no las
tiene nadie (cerrado por defecto) y el objeto está congelado para que ningún módulo lo amplíe en
tiempo de ejecución:

```js
export const PERMISOS = Object.freeze({
  CREAR_EVENTO:          [ROLES.ORGANIZER, ROLES.ADMIN],
  MODIFICAR_EVENTO:      [ROLES.ORGANIZER, ROLES.ADMIN],   // organizer solo los propios (lo verifica el servicio)
  CAMBIAR_ESTADO_EVENTO: [ROLES.ORGANIZER, ROLES.ADMIN],   // misma regla de propiedad
  VER_USUARIOS:          [ROLES.ADMIN],
  ASIGNAR_ROL:           [ROLES.ADMIN],
  VER_INSCRIPCIONES_EVENTO: [ROLES.ORGANIZER, ROLES.ADMIN],   // organizer solo las de sus eventos
  // Inscribirse y cancelar la propia inscripción no figuran: basta estar autenticado (cualquier rol);
  // la propiedad del ticket la verifica el servicio.
});
```

### 401 vs 403

| Código | Significa | Cuándo | Respuesta |
|--------|-----------|--------|-----------|
| **401 Unauthorized** | **No sé quién eres.** Falta la cookie `currentUser`, el token está manipulado, firmado con otro secreto o expirado | Lo responde el middleware de **autenticación** (`auth`) en cualquier ruta privada | `{ "status": "error", "message": "No autenticado" }` |
| **403 Forbidden** | **Sé quién eres y no puedes hacer esto.** Hay sesión válida pero el rol no está en los permitidos, o el recurso no es tuyo | Lo responde el middleware de **autorización** (`authorize`) o el servicio al verificar la propiedad | `{ "status": "error", "message": "No tienes permisos para realizar esta acción" }` (por rol) · `{ "status": "error", "message": "Solo puedes modificar tus propios eventos" }` (por propiedad) |

Ninguno de los dos casos llega al `500`: ambos son errores de la aplicación (`UnauthorizedError`,
`ForbiddenError` en `utils/errors.util.js`) que el middleware global traduce al código HTTP. Los
otros códigos de acceso también se distinguen: `404` recurso inexistente (id válido que no está) y
`400` datos inválidos (id con formato incorrecto, campos faltantes o fuera de rango).

### Middlewares

Los dos middlewares son reutilizables, viven en `src/middlewares/` y se encadenan en las rutas en
este orden: primero *quién eres*, después *qué puedes hacer*.

```js
// routes/events.router.js
router.post('/',     auth, authorize(...PERMISOS.CREAR_EVENTO),     controller.crear);
router.put('/:eid',  auth, authorize(...PERMISOS.MODIFICAR_EVENTO), controller.actualizar);
```

| Middleware | Archivo | Qué hace | Si falla |
|------------|---------|----------|----------|
| `auth` | `auth.middleware.js` | Estrategia `current` de Passport: lee el JWT de la cookie `currentUser` (o header `Bearer`), verifica firma y vigencia, deja `{ id, email, role }` en `req.user` | `401 No autenticado` |
| `authorize(...roles)` | `authorize.middleware.js` | Recibe los roles permitidos como parámetro y compara contra `req.user.role` | `403` si el rol no coincide; `401` si se usó sin `auth` antes (defensa ante un olvido) |

`authorize` valida sus argumentos al construir la ruta, en el arranque: sin roles o con un rol que
no existe en la matriz (`'organiser'`) lanza un `TypeError`, en lugar de bloquear la ruta en
silencio para todo el mundo en la primera petición.

### Propiedad de recursos

El middleware decide por rol; para decidir por *dueño* hace falta el evento, que está en la base.
Por eso la regla "un `organizer` solo modifica sus propios eventos" se aplica en
`EventsService.actualizar`, que ya carga el evento para modificarlo: compara `evento.organizer`
con `req.user.id` (ambos como `string`, gracias al DTO) y, si no coinciden y el rol no es `admin`,
lanza `ForbiddenError('Solo puedes modificar tus propios eventos')` → `403`. Un `admin` modifica
cualquiera. El `organizer` de un evento nunca viene del body: se toma de la sesión al crearlo y no
se puede cambiar al modificarlo.

### Primer admin

El registro público solo crea usuarios `user` y asignar roles por la API exige ser `admin`. Para la
primera instalación, el script de administración cambia el rol de un usuario ya registrado usando la
misma `MONGO_URL` del `.env` y las mismas capas que la API (`service → repository → dao`):

```bash
pnpm asignar-rol ana@mail.com admin
# Rol actualizado: ana@mail.com → admin (...)
```

> Con npm: `npm run asignar-rol -- ana@mail.com admin` (npm necesita el separador `--`; pnpm no).

Después, ese admin puede promover a otros desde `PATCH /api/users/:uid/role`. En ambos casos el
cambio rige en el **próximo login**: el JWT ya emitido conserva el rol anterior hasta que expire
(sesión sin estado, ver "Decisiones de seguridad").

## Estrategias de Passport

Todas las estrategias viven en `src/config/passport.config.js`. `app.js` solo las registra con
`configurarPassport()` e inicializa Passport con `passport.initialize()`; no usa
`passport.session()` porque la sesión viaja en el JWT, no en el servidor.

| Estrategia | Tipo | Qué hace | Entrega en `req.user` | Si falla |
|------------|------|----------|------------------------|----------|
| `register` | `passport-local` (`usernameField: 'email'`, `passReqToCallback`) | Valida campos obligatorios, formato de email y largo de contraseña; normaliza el email; verifica unicidad; hashea con bcrypt; crea el usuario con rol `user` (el rol del body se ignora) | Usuario creado sin contraseña | `400` / `409` según la regla incumplida |
| `login` | `passport-local` | Busca el usuario por email normalizado y compara la contraseña con bcrypt (contra un hash señuelo si el email no existe). **No firma el JWT ni setea la cookie** | `{ id, email, role }` | `401` `Credenciales inválidas` (genérico) · `400` si falta email o password |
| `current` | `passport-jwt` | Extrae el JWT de la cookie `currentUser` (o del header `Authorization: Bearer`), verifica firma (`HS256`, `JWT_SECRET`) y vigencia | `{ id, email, role }` del payload | `401` `No autenticado` |

Las rutas delegan en `passport.authenticate(...)` a través de `autenticarCon(estrategia)`
(`src/middlewares/auth.middleware.js`), un envoltorio que convierte los fallos de Passport al
formato JSON de la API en vez del `Unauthorized` en texto plano por defecto. Tras una estrategia
exitosa, el **controller** es quien responde: en el login firma el JWT (`utils/jwt.js`) y lo
guarda en la cookie; en `current` devuelve `req.user`; el logout no pasa por Passport.

### Preparado para providers externos

`passport.config.js` construye las estrategias en una sola función (`crearEstrategias`) que
devuelve un objeto `{ nombre: estrategia }` y las registra en un bucle. Para agregar Google o
GitHub basta con instalar la estrategia correspondiente (`passport-google-oauth20`,
`passport-github2`), sumar una entrada más a ese objeto con su `clientID`/`clientSecret` leídos de
`.env`, y crear las dos rutas del flujo OAuth (`/api/sessions/google` y su `callback`). Ni
`app.js`, ni las rutas existentes, ni el controller cambian: la nueva estrategia entrega el
usuario en `req.user` y el controller emite la misma cookie `currentUser` de siempre.

## Eventos: modelo, estados y reglas de negocio

### Modelo `Event`

| Campo | Tipo | Reglas |
|-------|------|--------|
| `title` | String | Obligatorio, texto no vacío, hasta 200 caracteres |
| `description` | String | Obligatorio, texto no vacío, hasta 2000 caracteres |
| `category` | String | Obligatorio, hasta 50 caracteres. Se guarda en minúsculas y sin espacios en los extremos (`cata`, `taller`, `charla`, `musica`, `workshop`...), así el filtro por categoría es una igualdad exacta |
| `date` | Date | Obligatoria, texto ISO 8601 con día existente, **posterior al momento actual** (al crear y al modificar). Se guarda en UTC: `"2027-03-15"` y `"2027-03-15T19:00:00"` (sin zona) se interpretan como UTC, `"2027-03-15T19:00:00-03:00"` se convierte |
| `location` | String | Obligatorio, texto no vacío, hasta 200 caracteres |
| `capacity` | Number | Obligatorio, entero **mayor que 0** |
| `price` | Number | Opcional, número **mayor o igual a 0** (por defecto `0`) |
| `status` | String | `enum` `draft` \| `published` \| `cancelled` \| `finished`. Nace en `draft`; solo cambia por `PATCH .../status` |
| `organizer` | ObjectId → `User` | **Referencia**, nunca el usuario embebido. Se toma de la sesión al crear; el body no puede fijarlo ni cambiarlo |
| `createdAt`, `updatedAt` | Date | Timestamps de Mongoose |

Los estados, las transiciones y los límites del listado viven en `src/config/events.config.js`
(única definición: el modelo la usa como `enum`, el servicio decide con ella y el listado valida
contra ella el filtro `status`). El esquema de Mongoose es la segunda barrera (`required`, `min`,
`enum`): aunque alguna escritura esquivara al servicio, no se guardaría un cupo 0 ni un estado inventado.

### Estados y transiciones

```
            publish              finish
  draft ──────────────► published ─────────► finished
    │                      │
    │ cancel               │ cancel
    ▼                      ▼
 cancelled ◄───────────────┘
```

| Desde | Puede pasar a | No puede |
|-------|---------------|----------|
| `draft` | `published`, `cancelled` | `finished` (nunca se publicó) |
| `published` | `cancelled`, `finished` | `draft` (no se despublica) |
| `cancelled` | — (final) | nada: tampoco se modifican sus datos |
| `finished` | — (final) | nada: tampoco se modifican sus datos |

**Cancelar = cambiar `status` a `cancelled`.** El evento sigue en la base y en el listado (filtrable
con `?status=cancelled`): no se elimina físicamente, así las inscripciones (tickets)
conservan su historial. No hay `DELETE /api/events/:eid`.

### Reglas de negocio (en `events.service.js`)

| Regla | Dónde se aplica | Respuesta |
|-------|-----------------|-----------|
| Campos obligatorios: `title`, `description`, `category`, `date`, `location`, `capacity` | crear | `400` `Faltan campos obligatorios: ...` |
| `date` en formato ISO 8601 con día existente | crear, modificar | `400` `El campo date debe ser una fecha válida en formato ISO 8601` |
| `date` posterior al momento actual | crear, modificar | `400` `La fecha del evento no puede ser pasada` |
| `capacity` entero > 0 · `price` número ≥ 0 | crear, modificar | `400` `El campo capacity debe ser un entero mayor que 0` · `El campo price debe ser un número mayor o igual a 0` |
| `organizer` sale de `req.user`; `organizer` y `status` del body se ignoran | crear, modificar | se descartan en silencio (whitelist de campos) |
| Solo el `organizer` dueño o un `admin` modifican o cambian el estado | modificar, estado | `403` `Solo puedes modificar tus propios eventos` |
| Un evento `cancelled` o `finished` no se modifica ni cambia de estado | modificar, estado | `409` `El evento está cancelado y no admite modificaciones` · `El evento ya finalizó y no admite modificaciones` |
| Solo transiciones de la tabla | estado | `409` `No se puede pasar un evento de draft a finished` · `El evento ya está en estado draft` |
| No se publica un evento cuya fecha ya pasó (sí se puede cancelar) | estado | `409` `No se puede publicar un evento cuya fecha ya pasó` |
| La escritura exige el estado que se leyó (si otra petición lo cambió en el medio, no se pisa) | modificar, estado | `409` `El evento cambió a estado cancelled mientras se procesaba la petición` |

El orden de verificación sobre un evento es: ¿existe? (`404`) → ¿es tuyo o eres admin? (`403`) →
¿sigue modificable? (`409`) → ¿la acción es coherente y los datos válidos? (`400`/`409`). Así un
`organizer` ajeno recibe `403` y no descubre, por el código de error, en qué estado está un evento
que no le pertenece. La única comprobación previa a cargar el evento es la **forma** del body en
`PATCH .../status`: un `status` ausente o desconocido es `400` antes de consultar la base, porque no
hay nada que buscar para una petición mal formada.

### Códigos de error

| Código | Significa | Ejemplos |
|--------|-----------|----------|
| `400` | La petición está mal formada o trae datos inválidos | campo faltante, fecha pasada o no ISO, `capacity: 0`, `status` desconocido, `page=abc`, id con formato inválido, JSON roto |
| `401` | No se pudo establecer quién eres | sin cookie, token manipulado o expirado |
| `403` | Estás identificado pero no puedes hacer esto | rol `user` creando eventos, `organizer` sobre un evento ajeno |
| `404` | El recurso no existe | id con formato válido pero sin evento |
| `409` | La acción es incoherente con el estado actual del recurso | modificar un evento cancelado, transición no permitida, publicar con fecha pasada |
| `413` | El cuerpo supera los 100 KB | descripción gigante |
| `500` | Error no previsto | el detalle queda en el log del servidor, nunca en la respuesta |

## Inscripciones (tickets): modelo, cupos, cancelación y correo

### Modelo `Ticket`

| Campo | Tipo | Reglas |
|-------|------|--------|
| `user` | ObjectId → `User` | **Referencia** al inscrito. Sale de la sesión; el body no puede fijarlo |
| `event` | ObjectId → `Event` | **Referencia** al evento (el `:eid` de la ruta) |
| `status` | String | `enum` `confirmed` \| `pending` \| `cancelled`. Nace `confirmed` |
| `quantity` | Number | Lugares que reserva la inscripción: entero entre 1 y 10 (por defecto 1) |
| `reservationCode` | String | Código legible y **único** (`AUR-7K3MQ9XZ`, sin 0/O ni 1/I/L). Lo genera el servidor y va en el correo |
| `cancelledAt` | Date | `null` hasta que se cancela |
| `createdAt`, `updatedAt` | Date | Timestamps de Mongoose |

Nunca se copia el usuario ni el evento dentro del ticket: las consultas que necesitan sus datos los
**pueblan** (`populate`) y el DTO entrega solo un resumen (`event`: `id, title, date, location`;
`user`: `id, first_name, last_name, email`). Índices: `event + status` (cupos), `user + createdAt`
(mis tickets), `reservationCode` único y un **índice único parcial** `user + event` sobre los
tickets activos, que garantiza en la base misma una sola inscripción activa por usuario y evento
aunque dos peticiones lleguen al mismo tiempo. Los estados y límites viven en `src/config/tickets.config.js`.

### Estados del ticket

| Estado | Significa | Ocupa cupo | Cómo se llega |
|--------|-----------|:----------:|---------------|
| `confirmed` | Inscripción vigente | Sí | `POST /api/events/:eid/tickets` |
| `pending` | Reservado a la espera de confirmación (previsto para un flujo de pago; hoy ninguna ruta lo produce) | Sí | — |
| `cancelled` | Cancelada por el usuario o un admin; se conserva como historial | No | `PATCH /api/tickets/:tid/cancel` |

### Flujo de inscripción (`POST /api/events/:eid/tickets`)

1. **Sesión** (`auth`): sin cookie o token inválido → `401`. Cualquier rol puede inscribirse.
2. **`quantity`** válida (entero 1..10; si no viene, 1) → si no, `400`.
3. **El evento existe** → si no, `404` (`400` si el id no tiene formato de ObjectId).
4. **El evento admite inscripciones**: está `published` y su fecha no pasó → si no, `409` con el motivo
   (`todavía no está publicado`, `está cancelado`, `ya finalizó`, `ya ocurrió`).
5. **Sin inscripción activa previa** del mismo usuario en ese evento → si no, `409` con el código de
   la existente. Una inscripción cancelada no cuenta: se puede volver a inscribir.
6. **Cupo suficiente**: `disponibles = capacity − Σ quantity de tickets activos` debe ser `≥ quantity`
   → si no, `409` (`El evento no tiene cupos disponibles` o `No hay cupo suficiente: quedan N lugares
   y solicitaste M`).
7. Se crea el ticket `confirmed` con su `reservationCode`.
8. **Recuento de seguridad**: si dos inscripciones simultáneas pasaron el paso 6 con el mismo conteo y
   juntas superan la capacidad, la más reciente se deshace antes de responder y recibe el `409` del
   paso 6. Esto reduce la ventana de sobreventa a la duración de la escritura (en pruebas de
   estrés con doce inscripciones simultáneas a tres cupos no se superó la capacidad); una garantía
   absoluta con varias instancias exigiría una transacción o un contador condicional.
9. **Correo de confirmación** con Nodemailer, después de persistir y sin bloquear la respuesta.
10. `201` con el ticket.

### Regla de cupos

```
ocupados    = suma de quantity de los tickets del evento con status confirmed o pending
disponibles = capacity − ocupados
```

Los tickets `cancelled` **no se cuentan**: al cancelar, el cupo queda libre de inmediato sin tocar
el evento ni llevar contadores aparte (no hay nada que desincronizar). `GET /api/events/:eid/tickets`
devuelve `cuposOcupados` y `cuposDisponibles` calculados así. La capacidad del evento no cambia al
inscribirse; es el dato de referencia del organizador.

### Cancelación (`PATCH /api/tickets/:tid/cancel`)

Cancelación **lógica**: `status = cancelled` y `cancelledAt = ahora`; el documento se conserva (sale en
`my-tickets` y en el listado del evento como historial). Reglas: el ticket existe (`404`), pertenece a
quien pide o quien pide es `admin` (`403` si no; el organizador del evento tampoco puede), y no está ya
cancelado (`409`). La escritura exige que el ticket siga activo, así dos cancelaciones simultáneas no se
pisan. No hay `DELETE`.

### Correos (Nodemailer)

Al confirmar una inscripción se envía al email del usuario de la sesión un correo con el título del
evento, fecha y hora (zona `America/Santiago`), lugar, cantidad de lugares y el `reservationCode`.
Al cancelar, el dueño del ticket recibe un aviso de cancelación (también si la hizo un admin), con el
código de reserva y la indicación de que el cupo quedó libre.
El transporte se configura solo con variables de entorno (`MAIL_HOST`, `MAIL_PORT`, `MAIL_USER`,
`MAIL_PASS`, `MAIL_FROM`; ver `.env.example`): no hay credenciales en el código. Sin `MAIL_HOST`, se
usa el transporte `jsonTransport` de Nodemailer: el correo se arma igual y se registra en la consola
del servidor, pero no sale a la red (útil para desarrollar y para la suite de tests). Si el SMTP
falla, la inscripción **igual responde `201`**: el ticket ya está guardado y el error queda en el log.
Para probar con un buzón real sin cuenta propia: [Ethereal](https://ethereal.email) entrega host,
usuario y clave de prueba y muestra los correos recibidos en su web.

## Rutas disponibles

| Método | Ruta | Descripción | Middlewares | Respuesta |
|--------|------|-------------|-------------|-----------|
| GET | `/api/health` | Estado del servidor | — | `200` `{ "status": "ok", "message": "Servidor activo" }` |
| POST | `/api/sessions/register` | Registro de usuario (siempre rol `user`) | estrategia `register` | `201` con el usuario creado · `400` · `409` |
| POST | `/api/sessions/login` | Inicio de sesión: emite el JWT en la cookie `currentUser` | estrategia `login` | `200` `Login correcto` · `400` · `401` |
| GET | `/api/sessions/current` | Usuario autenticado (lee la cookie) | `auth` | `200` `{ id, email, role }` · `401` |
| POST | `/api/sessions/logout` | Cierre de sesión: elimina la cookie | — | `200` `Sesión cerrada` |
| GET | `/api/events` | Listado paginado con filtros y orden (pública) | — | `200` `{ data, page, limit, total, totalPages }` · `400` parámetro inválido |
| GET | `/api/events/:eid` | Detalle de un evento (pública) | — | `200` · `404` si no existe · `400` id inválido |
| POST | `/api/events` | Crear un evento (nace `draft`) a nombre del usuario autenticado | `auth`, `authorize(organizer, admin)` | `201` con el evento · `400` · `401` · `403` |
| PUT | `/api/events/:eid` | Modificar datos de un evento (organizer: solo propios; admin: cualquiera) | `auth`, `authorize(organizer, admin)` + propiedad y estado en el servicio | `200` con el evento · `400` · `401` · `403` · `404` · `409` |
| PATCH | `/api/events/:eid/status` | Publicar, cancelar o finalizar (misma regla de propiedad) | `auth`, `authorize(organizer, admin)` + transiciones en el servicio | `200` con el evento · `400` · `401` · `403` · `404` · `409` |
| GET | `/api/users` | Listar todos los usuarios (sin contraseñas) | `auth`, `authorize(admin)` | `200` con la lista · `401` · `403` |
| PATCH | `/api/users/:uid/role` | Asignar rol a un usuario | `auth`, `authorize(admin)` | `200` con el usuario · `400` · `401` · `403` · `404` |
| POST | `/api/events/:eid/tickets` | Inscribirse a un evento publicado (envía correo) | `auth` + reglas de cupo/estado en el servicio | `201` con el ticket · `400` · `401` · `404` · `409` |
| GET | `/api/tickets/my-tickets` | Mis inscripciones, con el evento poblado | `auth` | `200` con la lista · `401` |
| GET | `/api/events/:eid/tickets` | Inscritos y cupos de un evento (organizer dueño o admin) | `auth`, `authorize(organizer, admin)` + propiedad en el servicio | `200` · `400` · `401` · `403` · `404` |
| PATCH | `/api/tickets/:tid/cancel` | Cancelar una inscripción (dueño del ticket o admin) | `auth` + propiedad en el servicio | `200` con el ticket · `400` · `401` · `403` · `404` · `409` |

Formato de respuesta: éxito `{ "status": "success", "payload": ... }` o
`{ "status": "success", "message": "..." }`; listados paginados
`{ "status": "success", "data": [...], "page", "limit", "total", "totalPages" }`; error
`{ "status": "error", "message": "..." }`.

A continuación, el detalle de cada ruta con ejemplos de request y response.

### `POST /api/sessions/register`

Request:

```json
{ "first_name": "Ana", "last_name": "Pérez", "email": "Ana@Mail.com ", "password": "Secreta123" }
```

| Campo | Reglas |
|-------|--------|
| `first_name`, `last_name` | Obligatorios |
| `email` | Obligatorio, formato válido, único. Se normaliza con `trim` + minúsculas |
| `password` | Obligatoria, mínimo 8 caracteres y máximo 72 bytes (límite de bcrypt). Se guarda hasheada con bcrypt |

El campo `role` **no se acepta desde el body**: todo usuario nuevo se crea con el rol `user`
(menor privilegio). Los roles posibles son `user`, `organizer` y `admin`.

Response `201`:

```json
{ "status": "success", "payload": { "id": "665f2a...", "first_name": "Ana", "last_name": "Pérez", "email": "ana@mail.com", "role": "user" } }
```

| Código | Cuándo | Cuerpo |
|--------|--------|--------|
| `400` | Faltan campos obligatorios | `{ "status": "error", "message": "Faltan campos obligatorios" }` |
| `400` | Email con formato inválido | `{ "status": "error", "message": "El email no tiene un formato válido" }` |
| `400` | Contraseña menor a 8 caracteres | `{ "status": "error", "message": "La contraseña debe tener al menos 8 caracteres" }` |
| `400` | Contraseña mayor a 72 bytes | `{ "status": "error", "message": "La contraseña no puede superar los 72 bytes" }` |
| `409` | Email ya registrado | `{ "status": "error", "message": "El email ya está registrado" }` |

La respuesta **nunca incluye la contraseña**, ni en texto plano ni hasheada.

### `POST /api/sessions/login`

Request:

```json
{ "email": "ana@mail.com", "password": "Secreta123" }
```

Response `200` (además setea la cookie `currentUser`, `HttpOnly`):

```json
{ "status": "success", "message": "Login correcto" }
```

```http
Set-Cookie: currentUser=eyJhbGciOiJIUzI1NiIs...; Max-Age=3600; Path=/; HttpOnly; SameSite=Lax
```

Response `401` (email inexistente **o** contraseña incorrecta: siempre el mismo mensaje, para no
revelar cuál de los dos falló):

```json
{ "status": "error", "message": "Credenciales inválidas" }
```

Response `400` (falta `email` o `password`):

```json
{ "status": "error", "message": "Faltan campos obligatorios" }
```

Qué hace el login:

1. La estrategia `login` valida la presencia de `email` y `password` y normaliza el email.
2. Busca el usuario y compara la contraseña con el hash almacenado (`bcrypt.compare`).
   Si el email no existe igual se ejecuta una comparación contra un hash señuelo, para que el
   tiempo de respuesta no delate qué correos están registrados. Si todo coincide, deja
   `{ id, email, role }` en `req.user`; si no, falla con el mensaje genérico.
3. El **controller** genera el JWT con ese payload mínimo (nunca la contraseña), firmado con
   `JWT_SECRET` y con expiración `JWT_EXPIRES_IN`.
4. El controller guarda el token en la cookie `currentUser` con `httpOnly: true`,
   `sameSite: 'lax'`, `maxAge: 3600000` y `secure: true` solo en producción. El token **no viaja
   en el body**.
   La cookie dura una hora; si `JWT_EXPIRES_IN` es menor, la sesión termina cuando expira el
   token (`/current` responde `401` aunque la cookie siga presente).

### `GET /api/sessions/current`

Ruta protegida por el middleware `auth`, que es la estrategia `current` de Passport: lee la
cookie `currentUser` (o, alternativamente, el header `Authorization: Bearer <token>`), verifica
la firma y la vigencia del JWT y deja `{ id, email, role }` en `req.user`.

Response `200` (con la cookie):

```json
{ "status": "success", "payload": { "id": "665f2a...", "email": "ana@mail.com", "role": "user" } }
```

Response `401` (sin cookie, token manipulado, firmado con otro secreto o expirado):

```json
{ "status": "error", "message": "No autenticado" }
```

### `POST /api/sessions/logout`

Elimina la cookie `currentUser` (la reenvía vencida con los mismos atributos con que se creó).
No requiere estar autenticado.

Response `200`:

```json
{ "status": "success", "message": "Sesión cerrada" }
```

### `GET /api/events`

Pública. Siempre paginada: sin parámetros devuelve la primera página de 10, ordenada por fecha
ascendente. Todos los parámetros son opcionales y se combinan entre sí.

| Parámetro | Valores | Efecto |
|-----------|---------|--------|
| `status` | `draft` · `published` · `cancelled` · `finished` | Igualdad exacta |
| `category` | texto | Igualdad exacta sin distinguir mayúsculas (`Workshop` = `workshop`) |
| `location` | texto | Contiene el texto, sin distinguir mayúsculas (`providencia` encuentra `Café Aurora, Providencia`) |
| `dateFrom` | fecha ISO 8601 | Eventos con `date >= dateFrom` (sin zona horaria se interpreta como UTC) |
| `dateTo` | fecha ISO 8601 | Eventos con `date <= dateTo`. Si viene sin hora (`2027-03-15`) abarca el día completo (UTC) |
| `page` | entero ≥ 1 (por defecto `1`) | Página a devolver |
| `limit` | entero entre 1 y 50 (por defecto `10`) | Tamaño de página. El máximo evita traer toda la colección |
| `sort` | `date` · `price` · `title` · `capacity` · `createdAt`, con `-` delante para descendente (por defecto `date`) | Orden. Siempre se desempata por id para que las páginas no repitan ni pierdan eventos |

```bash
curl "http://localhost:8080/api/events?status=published&category=workshop&page=2&limit=5"
curl "http://localhost:8080/api/events?location=providencia&dateFrom=2027-03-01&dateTo=2027-03-31&sort=-price"
```

Response `200`:

```json
{
  "status": "success",
  "data": [ { "id": "6690...", "title": "Taller de latte art", "description": "...", "category": "workshop", "date": "2027-04-01T18:00:00.000Z", "location": "Café Aurora, Providencia", "capacity": 8, "price": 20000, "status": "published", "organizer": "665f2a...", "createdAt": "...", "updatedAt": "..." } ],
  "page": 2,
  "limit": 5,
  "total": 7,
  "totalPages": 2
}
```

Una página más allá de la última responde `200` con `data: []` (y `total`/`totalPages` siguen
informando). Parámetros desconocidos se ignoran. Parámetros inválidos → `400`:

| Caso | Mensaje |
|------|---------|
| `status=activo` | `El filtro status debe ser uno de: draft, published, cancelled, finished` |
| `dateFrom=ayer`, `dateTo=2027-02-30` | `El filtro dateFrom debe ser una fecha válida en formato ISO 8601` (análogo para `dateTo`) |
| `dateFrom` posterior a `dateTo` | `El filtro dateFrom no puede ser posterior a dateTo` |
| `page=0`, `page=abc` | `El parámetro page debe ser un entero mayor que 0` |
| `limit=0`, `limit=51` | `El parámetro limit debe ser un entero entre 1 y 50` |
| `sort=organizer` | `El parámetro sort debe ser uno de: date, price, title, capacity, createdAt (con "-" delante para orden descendente)` |
| `status=a&status=b` | `El parámetro status debe indicarse una sola vez como texto` |

### `GET /api/events/:eid`

Pública. `200` con `{ "status": "success", "payload": { ...evento } }` · `404`
`No existe un evento con id ...` · `400` `El identificador enviado no es válido` si el id no tiene
formato de ObjectId.

### `POST /api/events`

Protegida con `auth` + `authorize(organizer, admin)`.

Request (con la cookie de un `organizer` o `admin`):

```json
{ "title": "Cata de cafés de Colombia", "description": "Tres orígenes con método V60", "category": "cata", "date": "2027-03-15T19:00:00.000Z", "location": "Café Aurora, Providencia", "capacity": 12, "price": 15000 }
```

Reglas de cada campo en [Modelo `Event`](#modelo-event). `organizer` y `status` **no se aceptan
desde el body**: el organizador es el usuario de la sesión y el evento nace en `draft`.

Response `201`:

```json
{ "status": "success", "payload": { "id": "6690...", "title": "Cata de cafés de Colombia", "description": "Tres orígenes con método V60", "category": "cata", "date": "2027-03-15T19:00:00.000Z", "location": "Café Aurora, Providencia", "capacity": 12, "price": 15000, "status": "draft", "organizer": "665f2a...", "createdAt": "...", "updatedAt": "..." } }
```

| Código | Cuándo | Cuerpo |
|--------|--------|--------|
| `401` | Sin cookie o token inválido | `{ "status": "error", "message": "No autenticado" }` |
| `403` | Sesión válida con rol `user` | `{ "status": "error", "message": "No tienes permisos para realizar esta acción" }` |
| `400` | Faltan campos | `{ "status": "error", "message": "Faltan campos obligatorios: description, category" }` |
| `400` | Fecha pasada | `{ "status": "error", "message": "La fecha del evento no puede ser pasada" }` |
| `400` | Valor inválido | `El campo capacity debe ser un entero mayor que 0` · `El campo price debe ser un número mayor o igual a 0` · `El campo date debe ser una fecha válida en formato ISO 8601` · `El campo category debe ser un texto no vacío` · `El campo title no puede superar los 200 caracteres` (análogos para `description`, `location`) |
| `413` | Body mayor a 100 KB | `{ "status": "error", "message": "El cuerpo de la petición es demasiado grande" }` |

### `PUT /api/events/:eid`

Protegida con `auth` + `authorize(organizer, admin)`; el servicio verifica además la propiedad y
el estado. Se envían solo los campos a cambiar (mismas reglas que al crear, fecha futura incluida);
los demás se conservan. `status` no se cambia por aquí (ver `PATCH .../status`).

```json
{ "title": "Cata de cafés de Etiopía", "capacity": 10 }
```

| Código | Cuándo | Cuerpo |
|--------|--------|--------|
| `200` | El `organizer` dueño o un `admin` | `{ "status": "success", "payload": { ...evento actualizado } }` |
| `403` | `organizer` sobre un evento ajeno | `{ "status": "error", "message": "Solo puedes modificar tus propios eventos" }` |
| `403` | Rol `user` | `{ "status": "error", "message": "No tienes permisos para realizar esta acción" }` |
| `404` | No existe un evento con ese id | `{ "status": "error", "message": "No existe un evento con id ..." }` |
| `409` | El evento está `cancelled` o `finished` | `{ "status": "error", "message": "El evento está cancelado y no admite modificaciones" }` |
| `400` | Id con formato inválido, sin campos modificables, valores inválidos o fecha pasada | `{ "status": "error", "message": "..." }` |
| `401` | Sin sesión | `{ "status": "error", "message": "No autenticado" }` |

### `PATCH /api/events/:eid/status`

Protegida con `auth` + `authorize(organizer, admin)`; propiedad y transiciones en el servicio.
El body solo lleva el estado destino; cualquier otro campo se ignora.

```json
{ "status": "published" }
```

| Código | Cuándo | Cuerpo |
|--------|--------|--------|
| `200` | Transición permitida (`draft→published`, `draft→cancelled`, `published→cancelled`, `published→finished`) | `{ "status": "success", "payload": { ...evento con el nuevo status } }` |
| `400` | Sin `status` | `{ "status": "error", "message": "Falta el campo obligatorio: status" }` |
| `400` | Estado desconocido (también `PUBLISHED` en mayúsculas) | `{ "status": "error", "message": "El campo status debe ser uno de: draft, published, cancelled, finished" }` |
| `403` | `organizer` sobre un evento ajeno · rol `user` | `Solo puedes modificar tus propios eventos` · `No tienes permisos para realizar esta acción` |
| `404` | No existe | `{ "status": "error", "message": "No existe un evento con id ..." }` |
| `409` | Evento ya cancelado o finalizado | `El evento está cancelado y no admite modificaciones` · `El evento ya finalizó y no admite modificaciones` |
| `409` | Transición no permitida | `No se puede pasar un evento de draft a finished` · `No se puede pasar un evento de published a draft` |
| `409` | Mismo estado | `El evento ya está en estado draft` |
| `409` | Publicar con la fecha ya pasada | `No se puede publicar un evento cuya fecha ya pasó` |
| `401` | Sin sesión | `{ "status": "error", "message": "No autenticado" }` |

### `POST /api/events/:eid/tickets`

Protegida con `auth` (cualquier rol). Body opcional:

```json
{ "quantity": 2 }
```

Response `201`:

```json
{ "status": "success", "payload": { "id": "66a1...", "user": "665f2a...", "event": "6690...", "status": "confirmed", "quantity": 2, "reservationCode": "AUR-7K3MQ9XZ", "createdAt": "2026-11-08T20:15:00.000Z", "cancelledAt": null } }
```

| Código | Cuándo | Cuerpo |
|--------|--------|--------|
| `401` | Sin sesión | `{ "status": "error", "message": "No autenticado" }` |
| `400` | `quantity` inválida (`0`, `-1`, `1.5`, `"2"`, `11`) | `{ "status": "error", "message": "El campo quantity debe ser un entero entre 1 y 10" }` |
| `400` | Id con formato inválido | `{ "status": "error", "message": "El identificador enviado no es válido" }` |
| `404` | El evento no existe | `{ "status": "error", "message": "No existe un evento con id ..." }` |
| `409` | Evento no publicado | `El evento todavía no está publicado` · `El evento está cancelado` · `El evento ya finalizó` · `El evento ya ocurrió` |
| `409` | Inscripción activa previa | `Ya tienes una inscripción activa para este evento (código AUR-...)` |
| `409` | Sin cupo | `El evento no tiene cupos disponibles` · `No hay cupo suficiente: quedan 1 lugares y solicitaste 2` |

`user`, `status`, `reservationCode` y `cancelledAt` del body se ignoran: el usuario es el de la sesión,
el ticket nace `confirmed` y el código lo genera el servidor.

### `GET /api/tickets/my-tickets`

Protegida con `auth`. Solo los tickets del usuario de la sesión (incluidos los cancelados, como
historial), del más reciente al más antiguo, con el evento poblado:

```json
{ "status": "success", "payload": [ { "id": "66a1...", "user": "665f2a...", "event": { "id": "6690...", "title": "Cata de cafés de Colombia", "date": "2027-03-15T19:00:00.000Z", "location": "Café Aurora, Providencia" }, "status": "confirmed", "quantity": 2, "reservationCode": "AUR-7K3MQ9XZ", "createdAt": "...", "cancelledAt": null } ] }
```

Sin inscripciones responde `payload: []`. Nunca incluye tickets ni datos de otros usuarios.

### `GET /api/events/:eid/tickets`

Protegida con `auth` + `authorize(organizer, admin)`; el servicio verifica que el `organizer` sea el
dueño del evento. Filtro opcional `?status=confirmed|pending|cancelled`.

```json
{
  "status": "success",
  "payload": {
    "event": { "id": "6690...", "title": "Cata de cafés de Colombia", "date": "2027-03-15T19:00:00.000Z", "status": "published", "capacity": 12 },
    "cuposOcupados": 2,
    "cuposDisponibles": 10,
    "tickets": [ { "id": "66a1...", "user": { "id": "665f2a...", "first_name": "Carla", "last_name": "Prueba", "email": "carla@mail.com" }, "event": "6690...", "status": "confirmed", "quantity": 2, "reservationCode": "AUR-7K3MQ9XZ", "createdAt": "...", "cancelledAt": null } ]
  }
}
```

Del inscrito solo se expone nombre y email (nunca contraseña ni rol). `403` `No tienes permisos para
realizar esta acción` con rol `user`; `403` `Solo puedes ver las inscripciones de tus propios eventos` con
un `organizer` ajeno; `404` si el evento no existe; `400` `El filtro status debe ser uno de: confirmed,
pending, cancelled`.

### `PATCH /api/tickets/:tid/cancel`

Protegida con `auth`; sin body. Response `200` con el ticket cancelado:

```json
{ "status": "success", "payload": { "id": "66a1...", "user": "665f2a...", "event": "6690...", "status": "cancelled", "quantity": 2, "reservationCode": "AUR-7K3MQ9XZ", "createdAt": "...", "cancelledAt": "2026-11-08T20:30:00.000Z" } }
```

| Código | Cuándo | Cuerpo |
|--------|--------|--------|
| `403` | Ticket de otro usuario (también para el organizador del evento) | `{ "status": "error", "message": "Solo puedes cancelar tus propios tickets" }` |
| `404` | No existe | `{ "status": "error", "message": "No existe un ticket con id ..." }` |
| `409` | Ya estaba cancelado | `{ "status": "error", "message": "El ticket ya está cancelado" }` |
| `400` / `401` | Id inválido / sin sesión | como el resto de la API |

### `GET /api/users`

Ruta administrativa: `auth` + `authorize(admin)`.

Response `200`:

```json
{ "status": "success", "payload": [ { "id": "665f2a...", "first_name": "Ana", "last_name": "Pérez", "email": "ana@mail.com", "role": "admin" } ] }
```

`401` sin sesión; `403` con rol `user` u `organizer`. La respuesta sale del DTO de usuario: nunca
incluye la contraseña ni su hash.

### `PATCH /api/users/:uid/role`

Ruta administrativa: `auth` + `authorize(admin)`.

```json
{ "role": "organizer" }
```

`200` con el usuario actualizado · `400` `El rol debe ser uno de: user, organizer, admin` · `400`
`No puedes cambiar tu propio rol` (un admin no se degrada a sí mismo: evita dejar la instalación sin
administradores) · `404` si el usuario no existe · `401` / `403` como el resto de rutas
administrativas. El nuevo rol rige en el próximo login del usuario.

## Cómo probarlo

Tres caminos, de más rápido a más detallado: la **colección de Postman** (flujo completo con tests
automáticos), la **suite de tests** (`pnpm test`, sin base instalada) y los **curl** de esta sección.

### Colección de Postman

`postman/CafeAurora.postman_collection.json` recorre los 10 casos del flujo completo en cinco
carpetas (salud, sesión, eventos y roles, inscripciones y cupos, sin sesión). Cada petición guarda en
variables de la colección los ids que necesita la siguiente (`eventId`, `ticketId`, `charlaId`,
`diegoId`) y comprueba el código de respuesta y el mensaje con tests, así se puede correr entera con
el Collection Runner.

1. Levanta el servidor (`pnpm dev`) y carga los datos de prueba (`pnpm seed`).
2. En Postman: *Import* → el archivo de la carpeta `postman/`. La variable `baseUrl` ya apunta a
   `http://localhost:8080`; cámbiala si usas otro puerto.
3. Ejecuta las carpetas en orden (o toda la colección con el Runner). La cookie `currentUser` la
   administra Postman solo: cada "Login como ..." reemplaza la sesión anterior.
4. El correo del caso 3 se ve en la consola del servidor (sin `MAIL_HOST`) o en el buzón configurado
   en `MAIL_*`. La colección deja la base como la encontró (cancela al final los tickets que creó sobre
   los eventos del seed), así se puede volver a correr sin repetir `pnpm seed`.

### Los 10 casos del flujo completo

| # | Caso | Dónde se prueba |
|---|------|-----------------|
| 1 | Registro → login → `/current` → logout → `/current` 401 | Postman carpeta 1 · curl "Cómo probarlo" pasos 1-5 · `test/flujo-final.test.js` |
| 2 | `user` intenta crear evento → 403 | Postman carpeta 2 · flujo de roles paso 6 |
| 3 | `organizer` crea evento → `user` se inscribe → correo → cupo descontado | Postman carpeta 3 · flujo de inscripciones paso 1 |
| 4 | Inscripción duplicada → 409 | Postman carpeta 3 · flujo de inscripciones paso 6 |
| 5 | Sin cupo suficiente → 409 con mensaje claro | Postman carpeta 3 · flujo de inscripciones paso 5 |
| 6 | Cancelar → cupo liberado → nueva inscripción funciona | Postman carpeta 3 · flujo de inscripciones paso 7 |
| 7 | `organizer` modifica evento ajeno → 403 | Postman carpeta 2 · flujo de eventos paso 5 |
| 8 | `admin` modifica evento de otro organizador → 200 | Postman carpeta 2 · flujo de eventos paso 6 |
| 9 | Ninguna respuesta de usuario, evento o ticket contiene `password` | Postman (test `no expone password` en cada petición) · `test/flujo-final.test.js` |
| 10 | `?status=published&page=2&limit=5` devuelve la estructura paginada | Postman carpeta 2 · flujo de eventos paso 8 |

Los diez están automatizados uno a uno en `test/flujo-final.test.js`.

### Con curl

La opción `-c` guarda la cookie que devuelve el login y `-b` la reenvía:

```bash
# 1. Registro
curl -X POST http://localhost:8080/api/sessions/register \
  -H "Content-Type: application/json" \
  -d '{ "first_name": "Ana", "last_name": "Pérez", "email": "ana@mail.com", "password": "Secreta123" }'

# 2. Login: guarda la cookie currentUser en cookies.txt (con -i se ve el header Set-Cookie)
curl -i -c cookies.txt -X POST http://localhost:8080/api/sessions/login \
  -H "Content-Type: application/json" \
  -d '{ "email": "ana@mail.com", "password": "Secreta123" }'
# { "status": "success", "message": "Login correcto" }

# 3. Usuario actual con la cookie → 200
curl -b cookies.txt http://localhost:8080/api/sessions/current
# { "status": "success", "payload": { "id": "...", "email": "ana@mail.com", "role": "user" } }

# 4. Logout: borra la cookie
curl -b cookies.txt -c cookies.txt -X POST http://localhost:8080/api/sessions/logout
# { "status": "success", "message": "Sesión cerrada" }

# 5. Usuario actual tras el logout → 401
curl -b cookies.txt http://localhost:8080/api/sessions/current
# { "status": "error", "message": "No autenticado" }

# Login con email inexistente o contraseña incorrecta → 401 con el mismo mensaje
curl -X POST http://localhost:8080/api/sessions/login \
  -H "Content-Type: application/json" \
  -d '{ "email": "nadie@mail.com", "password": "Secreta123" }'
# { "status": "error", "message": "Credenciales inválidas" }

# /current sin cookie → 401
curl http://localhost:8080/api/sessions/current
# { "status": "error", "message": "No autenticado" }

# /current con token manipulado → 401
curl -b "currentUser=token.manipulado.xyz" http://localhost:8080/api/sessions/current
# { "status": "error", "message": "No autenticado" }
```

### Flujo de roles (casos de la consigna)

```bash
# 0. Registrar tres usuarios: ana (será admin), bruno (será organizer) y carla (user)
for u in ana bruno carla; do
  curl -s -X POST http://localhost:8080/api/sessions/register -H "Content-Type: application/json" \
    -d "{ \"first_name\": \"$u\", \"last_name\": \"Prueba\", \"email\": \"$u@mail.com\", \"password\": \"Secreta123\" }"
done

# 1. Primer admin con el script (usa la MONGO_URL del .env)
pnpm asignar-rol ana@mail.com admin

# 2. Login de cada uno (una cookie por archivo)
for u in ana bruno carla; do
  curl -s -c $u.txt -X POST http://localhost:8080/api/sessions/login -H "Content-Type: application/json" \
    -d "{ \"email\": \"$u@mail.com\", \"password\": \"Secreta123\" }"
done

# 3. Ruta administrativa con admin → 200 (lista de usuarios, sin contraseñas)
curl -b ana.txt http://localhost:8080/api/users

# 4. El admin promueve a bruno a organizer → 200. Bruno vuelve a hacer login para renovar su JWT
BRUNO_ID=$(curl -s -b ana.txt http://localhost:8080/api/users | node -pe 'JSON.parse(require("fs").readFileSync(0)).payload.find(u => u.email === "bruno@mail.com").id')
curl -b ana.txt -X PATCH http://localhost:8080/api/users/$BRUNO_ID/role -H "Content-Type: application/json" -d '{ "role": "organizer" }'
curl -s -c bruno.txt -X POST http://localhost:8080/api/sessions/login -H "Content-Type: application/json" -d '{ "email": "bruno@mail.com", "password": "Secreta123" }'

# 5. Ruta administrativa con organizer → 403
curl -b bruno.txt http://localhost:8080/api/users
# { "status": "error", "message": "No tienes permisos para realizar esta acción" }

# 6. POST /api/events con user (carla) → 403
curl -b carla.txt -X POST http://localhost:8080/api/events -H "Content-Type: application/json" \
  -d '{ "title": "Cata de cafés de Colombia", "description": "Tres orígenes con método V60", "category": "cata", "date": "2027-03-15T19:00:00.000Z", "location": "Café Aurora, Providencia", "capacity": 12, "price": 15000 }'
# { "status": "error", "message": "No tienes permisos para realizar esta acción" }

# 7. POST /api/events con organizer (bruno) → 201
curl -b bruno.txt -X POST http://localhost:8080/api/events -H "Content-Type: application/json" \
  -d '{ "title": "Cata de cafés de Colombia", "description": "Tres orígenes con método V60", "category": "cata", "date": "2027-03-15T19:00:00.000Z", "location": "Café Aurora, Providencia", "capacity": 12, "price": 15000 }'
# { "status": "success", "payload": { "id": "...", "title": "Cata de cafés de Colombia", ..., "organizer": "<id de bruno>" } }

# 8. Cualquier ruta privada sin cookie → 401
curl -X POST http://localhost:8080/api/events -H "Content-Type: application/json" -d '{}'
# { "status": "error", "message": "No autenticado" }

# 9. organizer modificando un evento ajeno → 403 (ana crea uno como admin y bruno intenta editarlo)
EVENTO_AJENO=$(curl -s -b ana.txt -X POST http://localhost:8080/api/events -H "Content-Type: application/json" \
  -d '{ "title": "Noche de jazz", "description": "Trío en vivo", "category": "musica", "date": "2027-05-01T21:00:00.000Z", "location": "Café Aurora, Providencia", "capacity": 40 }' \
  | node -pe 'JSON.parse(require("fs").readFileSync(0)).payload.id')
curl -b bruno.txt -X PUT http://localhost:8080/api/events/$EVENTO_AJENO -H "Content-Type: application/json" -d '{ "title": "Otro" }'
# { "status": "error", "message": "Solo puedes modificar tus propios eventos" }

# 10. admin modificando cualquier evento → 200
curl -b ana.txt -X PUT http://localhost:8080/api/events/$EVENTO_AJENO -H "Content-Type: application/json" -d '{ "capacity": 50 }'
```

### Flujo de eventos (casos de la consigna)

Continúa con las cookies anteriores (`ana.txt` admin, `bruno.txt` organizer, `carla.txt` user).

```bash
EV=http://localhost:8080/api/events
H='Content-Type: application/json'

# 1. Crear evento con rol user → 403
curl -b carla.txt -X POST $EV -H "$H" -d '{ "title": "Taller de latte art", "description": "Técnica de vaporizado", "category": "workshop", "date": "2027-04-01T18:00:00.000Z", "location": "Café Aurora, Providencia", "capacity": 8, "price": 20000 }'
# { "status": "error", "message": "No tienes permisos para realizar esta acción" }

# 2. Crear evento con fecha pasada → 400
curl -b bruno.txt -X POST $EV -H "$H" -d '{ "title": "Taller de latte art", "description": "Técnica de vaporizado", "category": "workshop", "date": "2020-04-01T18:00:00.000Z", "location": "Café Aurora, Providencia", "capacity": 8, "price": 20000 }'
# { "status": "error", "message": "La fecha del evento no puede ser pasada" }

# 3. Crear evento con capacity: 0 → 400
curl -b bruno.txt -X POST $EV -H "$H" -d '{ "title": "Taller de latte art", "description": "Técnica de vaporizado", "category": "workshop", "date": "2027-04-01T18:00:00.000Z", "location": "Café Aurora, Providencia", "capacity": 0, "price": 20000 }'
# { "status": "error", "message": "El campo capacity debe ser un entero mayor que 0" }

# Crear uno válido como bruno (queda en draft) y guardar su id
TALLER=$(curl -s -b bruno.txt -X POST $EV -H "$H" -d '{ "title": "Taller de latte art", "description": "Técnica de vaporizado", "category": "workshop", "date": "2027-04-01T18:00:00.000Z", "location": "Café Aurora, Providencia", "capacity": 8, "price": 20000 }' \
  | node -pe 'JSON.parse(require("fs").readFileSync(0)).payload.id')

# 4. organizer modifica evento propio → 200
curl -b bruno.txt -X PUT $EV/$TALLER -H "$H" -d '{ "capacity": 10 }'

# 5. organizer modifica evento ajeno → 403 (EVENTO_AJENO lo creó ana)
curl -b bruno.txt -X PUT $EV/$EVENTO_AJENO -H "$H" -d '{ "capacity": 10 }'
# { "status": "error", "message": "Solo puedes modificar tus propios eventos" }

# 6. admin modifica evento de otro organizador → 200
curl -b ana.txt -X PUT $EV/$TALLER -H "$H" -d '{ "price": 18000 }'

# Publicar el taller → 200 (draft → published)
curl -b bruno.txt -X PATCH $EV/$TALLER/status -H "$H" -d '{ "status": "published" }'

# Cancelar la noche de jazz → 200 (sigue existiendo, con status cancelled)
curl -b ana.txt -X PATCH $EV/$EVENTO_AJENO/status -H "$H" -d '{ "status": "cancelled" }'
curl $EV/$EVENTO_AJENO
# { "status": "success", "payload": { ..., "status": "cancelled" } }

# 7. Cambiar estado (o datos) de un evento cancelado → 409
curl -b ana.txt -X PATCH $EV/$EVENTO_AJENO/status -H "$H" -d '{ "status": "published" }'
# { "status": "error", "message": "El evento está cancelado y no admite modificaciones" }
curl -b ana.txt -X PUT $EV/$EVENTO_AJENO -H "$H" -d '{ "title": "Otro" }'
# { "status": "error", "message": "El evento está cancelado y no admite modificaciones" }

# Transición no permitida → 409 (published → draft)
curl -b bruno.txt -X PATCH $EV/$TALLER/status -H "$H" -d '{ "status": "draft" }'
# { "status": "error", "message": "No se puede pasar un evento de published a draft" }

# 8. Listar con filtros → 200 paginado
curl "$EV?status=published&category=workshop&page=2&limit=5"
# { "status": "success", "data": [], "page": 2, "limit": 5, "total": 1, "totalPages": 1 }
curl "$EV?status=published&category=workshop&page=1&limit=5"
# { "status": "success", "data": [ { ...taller... } ], "page": 1, "limit": 5, "total": 1, "totalPages": 1 }
curl "$EV?location=providencia&dateFrom=2027-03-01&dateTo=2027-12-31&sort=-date"

# 9. Consultar evento inexistente → 404 (formato válido) · id con formato inválido → 400
curl $EV/665f2a1b2c3d4e5f6a7b8c9d
# { "status": "error", "message": "No existe un evento con id 665f2a1b2c3d4e5f6a7b8c9d" }
curl $EV/abc
# { "status": "error", "message": "El identificador enviado no es válido" }
```

### Flujo de inscripciones (casos de la consigna)

Continúa con las cookies anteriores (`ana.txt` admin, `bruno.txt` organizer, `carla.txt` user) y el
taller publicado por bruno (`$TALLER`). Registra y loguea además a `diego` (user) para el ticket ajeno.

```bash
EV=http://localhost:8080/api/events
TK=http://localhost:8080/api/tickets
H='Content-Type: application/json'
curl -s -X POST http://localhost:8080/api/sessions/register -H "$H" -d '{ "first_name": "diego", "last_name": "Prueba", "email": "diego@mail.com", "password": "Secreta123" }'
curl -s -c diego.txt -X POST http://localhost:8080/api/sessions/login -H "$H" -d '{ "email": "diego@mail.com", "password": "Secreta123" }'

# 1. Inscripción exitosa → 201 y correo a carla@mail.com (en la consola del servidor si no hay MAIL_HOST)
TICKET=$(curl -s -b carla.txt -X POST $EV/$TALLER/tickets -H "$H" -d '{ "quantity": 2 }' \
  | node -pe 'JSON.parse(require("fs").readFileSync(0)).payload.id')
# { "status": "success", "payload": { "id": "...", "status": "confirmed", "quantity": 2, "reservationCode": "AUR-...", ... } }

# 2. Inscripción sin sesión → 401
curl -X POST $EV/$TALLER/tickets -H "$H" -d '{}'
# { "status": "error", "message": "No autenticado" }

# 3. Evento inexistente → 404
curl -b carla.txt -X POST $EV/665f2a1b2c3d4e5f6a7b8c9d/tickets -H "$H" -d '{}'
# { "status": "error", "message": "No existe un evento con id 665f2a1b2c3d4e5f6a7b8c9d" }

# 4. Evento cancelado → 409 (la noche de jazz quedó cancelled en el flujo anterior)
curl -b carla.txt -X POST $EV/$EVENTO_AJENO/tickets -H "$H" -d '{}'
# { "status": "error", "message": "El evento está cancelado" }

# 5. Sin cupo suficiente → 409 con mensaje claro (el taller tiene capacity 10: quedan 8)
curl -b diego.txt -X POST $EV/$TALLER/tickets -H "$H" -d '{ "quantity": 9 }'
# { "status": "error", "message": "No hay cupo suficiente: quedan 8 lugares y solicitaste 9" }

# 6. Inscripción duplicada activa → 409
curl -b carla.txt -X POST $EV/$TALLER/tickets -H "$H" -d '{}'
# { "status": "error", "message": "Ya tienes una inscripción activa para este evento (código AUR-...)" }

# Mis tickets (con el evento poblado)
curl -b carla.txt $TK/my-tickets

# 7. Cancelación propia → 200 cancelled con cancelledAt; el cupo vuelve a 10 y diego ya puede tomar 9
curl -b carla.txt -X PATCH $TK/$TICKET/cancel
curl -b diego.txt -X POST $EV/$TALLER/tickets -H "$H" -d '{ "quantity": 9 }'
# { "status": "success", "payload": { ..., "quantity": 9 } }

# 8. Cancelar un ticket ajeno como user → 403 (la propiedad se verifica antes que el estado)
curl -b diego.txt -X PATCH $TK/$TICKET/cancel
# { "status": "error", "message": "Solo puedes cancelar tus propios tickets" }

# Cancelar dos veces → 409
curl -b carla.txt -X PATCH $TK/$TICKET/cancel
# { "status": "error", "message": "El ticket ya está cancelado" }

# 9. Inscritos del evento como user común → 403
curl -b carla.txt $EV/$TALLER/tickets
# { "status": "error", "message": "No tienes permisos para realizar esta acción" }

# 10. Inscritos como organizer de otro evento → 403 (promueve a diego a organizer con ana, re-login, y prueba)
DIEGO_ID=$(curl -s -b ana.txt http://localhost:8080/api/users | node -pe 'JSON.parse(require("fs").readFileSync(0)).payload.find(u => u.email === "diego@mail.com").id')
curl -s -b ana.txt -X PATCH http://localhost:8080/api/users/$DIEGO_ID/role -H "$H" -d '{ "role": "organizer" }'
curl -s -c diego.txt -X POST http://localhost:8080/api/sessions/login -H "$H" -d '{ "email": "diego@mail.com", "password": "Secreta123" }'
curl -b diego.txt $EV/$TALLER/tickets
# { "status": "error", "message": "Solo puedes ver las inscripciones de tus propios eventos" }

# Inscritos como organizer dueño (bruno) o admin (ana) → 200 con cupos e historial
curl -b bruno.txt $EV/$TALLER/tickets
# { "status": "success", "payload": { "event": {...}, "cuposOcupados": 9, "cuposDisponibles": 1, "tickets": [ ... ] } }
curl -b ana.txt "$EV/$TALLER/tickets?status=cancelled"
```

En Postman o Thunder Client la cookie se guarda sola tras el login: basta con llamar a la ruta
después y ver el código; para probar el `401`, borrar la cookie `currentUser` en el gestor de
cookies (o esperar a que expire). Para cambiar de rol, hacer login con otro usuario.

### Suite de tests

```bash
pnpm test
```

195 tests de integración en 16 archivos, con MongoDB en memoria (`mongodb-memory-server`): no hace
falta una base instalada ni credenciales. Cada archivo levanta su propia instancia, por eso el script
los corre de a cuatro (`--test-concurrency=4`): lanzar los dieciséis a la vez puede agotar el tiempo
de conexión en una máquina con poca memoria.

| Área | Archivos | Qué verifican |
|------|----------|---------------|
| Flujo completo | `flujo-final.test.js`, `flujo-completo.test.js` | Los [10 casos del flujo completo](#los-10-casos-del-flujo-completo), uno por test, con códigos y mensajes exactos (cookie `HttpOnly` en el login y su borrado en el logout); el recorrido registro → login → crear evento → publicar → inscribirse → mis tickets → inscritos → cancelar → logout por todas las capas, sin que ningún hash ni la palabra `password` salga en ninguna respuesta |
| Arquitectura | `architecture.test.js` | DAO, repository, service y controller por entidad y un DTO por entidad; reglas de dependencia leídas del código fuente (solo los DAOs importan modelos; `mongoose` solo en `models/`, `dao/` y la conexión; services sin DAOs ni modelos; controllers sin modelos, DAOs ni repositories; repositories con el DAO inyectado y DTO; routers que componen la cadena; sin `console.log` sueltos); los DTOs omiten `password`, `__v` y `_id` y filtran los documentos poblados |
| Arranque y API base | `config.test.js`, `api.test.js` | Fail-Fast de `JWT_EXPIRES_IN` (numérico = segundos, con unidad, inválido o cero) y de `JWT_SECRET`; `/api/health`, listado vacío, `404` de evento y de ruta, id inválido, URL mal codificada y JSON roto → `400` |
| Sesión | `register.test.js`, `auth.test.js`, `passport.test.js` | Registro: email normalizado, hash de bcrypt en la base, rol del body ignorado, `400` por campos, formato y largo de contraseña (8 caracteres, 72 bytes), `409` duplicado. Login: cookie `httpOnly`, JWT solo con `{ id, email, role }`, `401` genérico, `400` sin campos; `/current` con cookie o `Bearer`, `401` sin token, manipulado, expirado o con algoritmo `none`; el logout borra la cookie. Passport: estrategias registradas, el controller (no la estrategia) firma el JWT, fallos en JSON, credenciales solo desde el body, payload con otra forma → `401` |
| Autorización | `authorize.test.js`, `users.test.js` | Matriz de permisos congelada; `authorize(...roles)` deja pasar, `403` por rol, `401` sin `auth` antes, `TypeError` con roles desconocidos; las rutas no comparan roles a mano; tabla 401 vs 403 de **todas** las rutas privadas. `/api/users`: solo admin y sin contraseñas; asignar rol (rige en el próximo login; `400` rol inválido o propio rol, también con el id en mayúsculas; `404`) |
| Eventos | `events.test.js`, `events-rules.test.js`, `events-status.test.js`, `events-list.test.js` | Crear y modificar por rol y por propiedad (`organizer` dueño, `admin`, intruso → `403` sin cambios); `organizer`/`status` del body ignorados; fecha pasada al crear y al modificar con reloj inyectado; obligatorios, largos máximos y `category` normalizada; eventos `cancelled`/`finished` inmutables también para `admin`; escritura condicional → `409` si cambió de estado en el medio, `404` si desapareció; body > 100 KB → `413`. Máquina de estados: tabla congelada, transiciones permitidas y prohibidas, mismo estado, publicar con fecha pasada, `status` ausente o inválido → `400`. Listado: formato paginado y defaults, página fuera de rango, filtros (`status`, `category`, `location` con caracteres escapados, rango de fechas inclusivo), orden con desempate por id, `400` por parámetros inválidos o repetidos, criterios neutros hacia el repositorio |
| Inscripciones | `tickets.test.js`, `tickets-cupos.test.js` | Inscripción `201` con código `AUR-…` y **un correo** al inscrito; `quantity` > 1 e inválida (9 variantes → `400`); referencias y no objetos; campos del body ignorados; `401`, `404`, `400`; evento `draft`/`cancelled`/`finished` o ya ocurrido → `409` sin correo; duplicado activo → `409` con el código (en el servicio y en el índice parcial), y tras cancelar se puede volver a inscribir; SMTP caído → igual `201`. Cancelación: propia `200` con `cancelledAt`, ajena → `403` (también para el organizador del evento), admin sí, dos veces → `409`, correo al dueño también si cancela un admin. Cupos: nunca más lugares que la capacidad, los cancelados no cuentan, **8 inscripciones simultáneas a 3 cupos → exactamente 3 confirmadas** sin reservas fantasma, el servicio deshace solo la más reciente, el correo va después de persistir, 1000 códigos distintos. `my-tickets` solo propios con `event` poblado; inscritos por evento con `cuposOcupados`/`cuposDisponibles`, usuario poblado sin contraseña ni rol, filtro `?status`, `403` para `user` y para un organizer ajeno |

## Decisiones de diseño de los eventos

- **Reglas en el servicio, no en rutas ni controllers.** `events.router.js` solo compone capas y
  declara middlewares; `events.controller.js` extrae `req.query`/`req.body`/`req.params`/`req.user` y
  responde. Toda regla (fecha, cupo, precio, propiedad, estados) está en `events.service.js`, con
  tests unitarios que lo ejercitan con un repositorio falso, sin HTTP ni base. Alternativa
  descartada: validar en el router con un middleware por campo, que dispersa las reglas y las
  duplica entre `POST` y `PUT`.
- **Máquina de estados en una tabla congelada** (`TRANSICIONES` en `events.config.js`) en vez de
  `if` encadenados en el servicio. Agregar un estado o permitir una transición es tocar una línea;
  los estados finales se derivan de la tabla (los que no tienen salidas), así no hay dos listas que
  desincronizar.
- **Cancelar es una transición, no un `DELETE`.** La consigna lo exige y además los tickets
  necesitan el evento al que apuntan para conservar su historial. Por eso tampoco hay borrado físico
  "administrativo".
- **Eventos finales inmutables, también para `admin`.** Modificar el precio de un evento cancelado no
  tiene sentido de negocio; si hace falta, se crea otro. La consigna admite excepciones "con
  justificación documentada": no se encontró ninguna que valiera la complejidad.
- **`400` vs `409`.** Un dato mal formado (fecha no ISO, `capacity: 0`, `status: "activo"`) es `400`.
  Una acción bien formada pero incompatible con el estado actual (publicar algo cancelado, pasar de
  `published` a `draft`, publicar con fecha ya pasada) es `409 Conflict`: el cliente no tiene que
  cambiar el formato de su petición, tiene que mirar el recurso.
- **Escritura condicional.** `PUT` y `PATCH` leen el evento, validan y escriben con
  `findOneAndUpdate({ _id, status: { $in: estadosEsperados } })`. Si otra petición lo canceló en el
  medio, la escritura no encuentra el documento y el servicio responde `409` en vez de pisar el
  cambio. Lo que se lee y lo que se escribe es consistente sin transacciones.
- **Fecha futura también al modificar.** La consigna solo exige "al crear", pero permitir mover un
  evento al pasado por `PUT` dejaría la regla sin efecto.
- **Publicar exige fecha futura; finalizar no la exige.** Nadie debe poder inscribirse a algo que
  ya ocurrió; en cambio, un organizador puede dar por terminado un evento antes de la hora prevista.
- **`category` como texto normalizado, no como colección aparte.** La consigna filtra por
  `category=workshop` (un texto) y pide "campos mínimos". Una colección `Category` con referencia
  obligaría a resolver el texto a un id en cada filtro y a un CRUD más sin valor para el proyecto;
  guardarla en minúsculas hace que el filtro sea una igualdad exacta e indexable. Si más adelante
  hace falta catálogo de categorías, el cambio queda contenido en el modelo y el servicio.
- **Listado siempre paginado, con tope.** `limit` máximo 50: una petición sin parámetros nunca trae
  la colección completa. Los parámetros se validan (`400`) en lugar de corregirse en silencio, para
  que un cliente note su error. El orden se desempata por `_id` para que dos eventos con la misma
  fecha no se intercambien entre páginas.
- **Criterios neutros entre capas.** El servicio entrega al repositorio `{ status, category,
  location, dateFrom, dateTo }` y `{ page, limit, orden }` ya validados; el DAO los traduce a
  `$regex`/`$gte`/`$lte`/`$in`. Así el servicio no conoce MongoDB y los tests del servicio no
  necesitan base.
- **Reloj inyectable.** `EventsService` recibe `{ ahora }` opcional; los tests de reglas temporales
  fijan la fecha en vez de depender de la hora en que corren.
- **Los borradores se ven en el listado público.** Facilita que el evaluador pruebe
  `?status=draft` y el detalle recién creado; ocultarlos a quien no sea el organizador es una
  decisión de producto pendiente; hoy la API es la misma para todos los clientes.

## Decisiones de diseño de las inscripciones

- **Cupo derivado, no contador.** `disponibles = capacity − Σ quantity activos` se calcula con una
  agregación sobre los tickets cada vez que hace falta. Alternativa descartada: un campo
  `cuposOcupados` en `Event` que se incrementa y decrementa; es más rápido de leer pero se desincroniza
  ante cualquier fallo a mitad de camino y obliga a recalcularlo. La consigna pide justamente que
  cancelar libere el cupo "por no contarse en el cálculo".
- **Una inscripción activa por usuario y evento, con `quantity`.** Quien va con acompañantes reserva
  varios lugares en un solo ticket (máximo 10). Las canceladas no bloquean una nueva.
- **El duplicado se impide dos veces**: el servicio lo detecta y responde con el código existente
  (`409` claro), y un índice único parcial en la base lo garantiza también cuando dos peticiones del
  mismo usuario llegan al mismo tiempo (el error de clave duplicada se traduce al mismo `409`).
- **Sobreventa bajo concurrencia sin transacciones.** Dos inscripciones simultáneas pueden leer el
  mismo conteo y ambas insertar. Después de insertar, el servicio recuenta incluyendo solo los
  tickets creados hasta el suyo (los `ObjectId` crecen con el tiempo): si con él se supera la
  capacidad, es el que sobra y se deshace antes de responder. Es el **único borrado físico** del
  proyecto y solo afecta a una reserva que nunca llegó al cliente. Reduce la ventana de sobreventa a
  la duración de la escritura y en una instancia se comportó sin fallas bajo estrés; con varias
  instancias la garantía absoluta exigiría una transacción (replica set) o un contador condicional
  en el evento. Alternativa descartada: un lock en memoria, que no sirve con más de una instancia.
- **Cancelar es lógico y solo del dueño o un admin.** El organizador del evento no cancela tickets
  ajenos: no es su acuerdo. Se conserva el documento con `cancelledAt` para historial y auditoría.
- **El correo va después de persistir y no bloquea.** Primero el ticket, luego el aviso: nunca se
  confirma por correo algo que no existe. Si el SMTP falla, la inscripción sigue siendo válida; el
  fallo se registra. El transporte se inyecta en el servicio, así los tests observan los envíos sin
  red y producción usa SMTP real.
- **Sin `MAIL_HOST` el servidor arranca igual.** Un equipo sin credenciales de correo puede
  desarrollar y correr los tests; el transporte `jsonTransport` de Nodemailer arma el mensaje y lo
  registra. En producción, las variables `MAIL_*` son la única fuente de credenciales.
- **`pending` existe pero no se usa todavía.** Lo exige el contrato de la entidad; queda definido
  como estado activo (ocupa cupo) para un flujo de pago futuro, sin inventar hoy una ruta que lo
  produzca.
- **Inscribirse solo a eventos `published` y futuros.** Un borrador no es público, un cancelado o
  finalizado no admite inscripciones, y un evento publicado cuya fecha ya pasó tampoco. Los cuatro casos
  responden `409` con su motivo.

## Decisiones de seguridad

- **Autorización en el middleware, no en las rutas ni solo en el negocio**: las rutas declaran
  `auth, authorize(...PERMISOS.X)`; los controllers y servicios reciben un `req.user` ya autorizado.
  La única comparación fuera del middleware es la de propiedad (`organizer` dueño), que necesita el
  recurso cargado y por eso vive en el servicio junto a las demás reglas del evento.
- **Cerrado por defecto**: la matriz solo enumera lo permitido; un rol o acción fuera de ella no
  tiene permiso. `authorize` sin `req.user` responde `401` en vez de fallar con `500`, y los roles
  desconocidos se detectan al arrancar.
- **El rol nunca viene del cliente**: ni en el registro (se ignora del body) ni al crear o modificar
  eventos (`organizer` sale de la sesión). Solo un `admin` cambia roles, por una ruta protegida o
  por el script de administración con acceso a la base.
- **Ids comparados como texto**: el DTO de evento convierte `organizer` a `string`, igual que el
  `id` del JWT, así la verificación de propiedad no depende de `ObjectId` vs `string`.
- **Credenciales de correo solo en el entorno**: `MAIL_*` se leen en `env.config.js` y llegan al
  transporte por inyección; no hay host, usuario ni clave en el código ni en el repositorio
  (`.env` está en `.gitignore`; `.env.example` trae valores de ejemplo). El contenido del correo
  escapa el HTML de los datos del evento.
- **El ticket pertenece a la sesión**: `user` sale siempre de `req.user`; el `GET` de inscritos de un
  evento expone del inscrito solo nombre y email (nunca contraseña ni rol) y solo al organizador
  dueño o a un admin; `my-tickets` filtra por el usuario de la sesión en la consulta, no después.
- **Entrada del listado saneada**: `location` se escapa antes de convertirse en expresión regular
  (`.*` no es un comodín); `sort` solo acepta campos de una lista; un parámetro repetido
  (`?status=a&status=b`, que Express entrega como arreglo) se rechaza con `400` en vez de pasarlo a
  la consulta. Los objetos en el body (`{ "status": { "$ne": 1 } }`) nunca llegan a Mongoose: cada
  campo se valida por tipo.
- **Contraseñas**: se guardan solo como hash de bcrypt (`utils/hash.js`, funciones
  reutilizables `hashPassword` / `comparePassword`). Nunca se devuelven ni se incluyen en el JWT.
  Se rechazan las de más de 72 bytes porque bcrypt ignora el resto y compararía truncado.
- **Entrada validada en la frontera**: email y password deben ser strings; un objeto en el body
  (por ejemplo `{ "$gt": "" }`) se rechaza antes de llegar a la consulta de Mongoose.
- **Mensaje genérico en el login**: `Credenciales inválidas` tanto si el email no existe como si
  la contraseña no coincide. Además se compara siempre contra un hash (real o señuelo) para no
  revelar por tiempo de respuesta qué emails existen.
- **JWT**: firmado con `JWT_SECRET` de entorno, algoritmo fijado en el servidor
  (`algorithms: ['HS256']`, nunca tomado del header del token), payload mínimo `{ id, email, role }`
  y expiración configurable.
- **Cookie `httpOnly`**: el token no es accesible desde JavaScript del navegador (mitiga XSS);
  `sameSite: 'lax'` reduce el riesgo de CSRF; `secure` solo en producción para poder probar en
  `http://localhost`.
- **Estrategia `current` / middleware `auth`**: ante cualquier falla (sin token, firma inválida,
  manipulado, expirado) responde `401 No autenticado` sin detallar la causa.
- **Passport no firma tokens**: las estrategias solo autentican y entregan el usuario; emitir el
  JWT y manejar la cookie es responsabilidad del controller (capa HTTP).
- **Credenciales solo en el body**: `passport-local` también las leería de la query string, pero
  las estrategias validan desde `req.body` para que ninguna contraseña termine en URLs o logs.
- **Payload del JWT verificado en forma, no solo en firma**: la estrategia `current` exige
  `{ id, email, role }`; un token firmado con el mismo secreto pero con otro contenido no
  autentica.
- **Fail-Fast de configuración**: sin `JWT_SECRET` o `MONGO_URL` el servidor no arranca; un
  `JWT_EXPIRES_IN` inválido o cero también lo detiene, y un secreto de menos de 32 caracteres
  genera un aviso al iniciar.
- **Sesión sin estado**: `/current` y `authorize` deciden con el payload del JWT, sin consultar la
  base. Un cambio de rol (o la baja del usuario) rige cuando el token expira o el usuario vuelve a
  iniciar sesión; por eso la expiración es corta (1 h) y el `PATCH .../role` lo documenta. La
  alternativa (consultar el rol en la base en cada petición) se evalúa cuando existan acciones
  más sensibles; hoy el costo de una hora de desfase es aceptable.

## Estructura de carpetas

```
coderhouse-backend2-entregafinal/
├── src/
│   ├── app.js                        # configura Express (json, cookie-parser, routers); no levanta el server
│   ├── server.js                     # punto de entrada: conecta MongoDB y levanta el servidor
│   ├── config/
│   │   ├── env.config.js             # carga y valida variables de entorno (Fail-Fast), JWT_EXPIRES_IN
│   │   ├── db.config.js              # conectarDB / desconectarDB: único lugar fuera de models/dao que usa mongoose
│   │   ├── passport.config.js        # estrategias 'register', 'login' y 'current' centralizadas
│   │   ├── roles.config.js           # ROLES, USER_ROLES, DEFAULT_ROLE y la matriz PERMISOS
│   │   ├── events.config.js          # estados, TRANSICIONES, estados finales, largos máximos, campos ordenables, paginación
│   │   ├── tickets.config.js         # estados del ticket, estados activos (ocupan cupo), rango de quantity
│   │   └── mail.config.js            # transporte de Nodemailer desde MAIL_* (jsonTransport si no hay MAIL_HOST)
│   ├── routes/
│   │   ├── index.js                  # router principal: monta los recursos bajo /api
│   │   ├── health.router.js
│   │   ├── events.router.js          # GET públicos; POST/PUT/PATCH status con auth + authorize; anida /:eid/tickets
│   │   ├── tickets.router.js         # compone la cadena de tickets; GET /my-tickets, PATCH /:tid/cancel
│   │   ├── users.router.js           # rutas administrativas: auth + authorize(admin)
│   │   └── sessions.router.js        # delega en passport.authenticate(...) vía autenticarCon
│   ├── controllers/
│   │   ├── health.controller.js
│   │   ├── events.controller.js      # listar (query), obtenerPorId, crear, actualizar, cambiarEstado
│   │   ├── tickets.controller.js     # inscribir, misTickets, ticketsDeEvento, cancelar
│   │   ├── users.controller.js       # listar, asignarRol
│   │   └── sessions.controller.js    # HTTP: responde códigos, firma el JWT y setea/borra la cookie
│   ├── services/
│   │   ├── events.service.js         # reglas: obligatorios, fecha futura, cupo/precio, propiedad, estados, filtros/paginación
│   │   ├── tickets.service.js        # inscripción (evento publicado, duplicados, cupos, recuento), cancelación lógica + aviso, listados
│   │   ├── mail.service.js           # correos de confirmación y cancelación; un fallo se registra, no rompe la operación
│   │   └── users.service.js          # administración: listar usuarios, asignar rol válido
│   ├── repositories/
│   │   ├── events.repository.js      # buscar paginado, getById, actualizarSiModificable, cambiarEstado; devuelve DTOs
│   │   ├── tickets.repository.js     # create, findByUser/Event (poblados), activo por usuario y evento, contarCuposOcupados, cancelar
│   │   └── users.repository.js       # acceso a datos; devuelve DTOs sin contraseña
│   ├── dao/
│   │   ├── events.dao.js             # única capa con Mongoose: traduce criterios a $regex/$gte/$in, find+count
│   │   ├── tickets.dao.js            # populate de event/user, aggregate de cupos, update condicional, removeById (rollback)
│   │   └── users.dao.js              # única capa que usa el modelo User de Mongoose
│   ├── dto/
│   │   ├── user.dto.js               # toUserDTO (registro, listado) y toSessionDTO ({ id, email, role })
│   │   ├── event.dto.js              # toEventDTO: ObjectId → string, sin _id ni __v
│   │   └── ticket.dto.js             # toTicketDTO: referencias como id o resumen poblado (sin password ni role)
│   ├── models/
│   │   ├── User.js                   # first_name, last_name, email (único), password, role (enum de roles.config)
│   │   ├── Event.js                  # title, description, category, date, location, capacity, price, status (enum), organizer (ref User)
│   │   └── Ticket.js                 # user (ref), event (ref), status (enum), quantity, reservationCode (único), cancelledAt; índice único parcial
│   ├── middlewares/
│   │   ├── auth.middleware.js        # autenticarCon(estrategia) envuelve passport.authenticate; auth = 'current' → 401
│   │   ├── authorize.middleware.js   # authorize(...roles): compara req.user.role → 403
│   │   ├── notFound.middleware.js
│   │   └── error.middleware.js       # traduce errores a 400 / 401 / 403 / 404 / 409 / 413 / 500
│   ├── scripts/
│   │   ├── asignar-rol.js            # pnpm asignar-rol <email> <rol>: primer admin de una instalación
│   │   └── seed.js                   # pnpm seed: usuarios (admin, organizer, 2 user) y eventos de prueba, idempotente
│   └── utils/
│       ├── jwt.js                    # signToken (jsonwebtoken, HS256, JWT_SECRET); la verificación la hace passport-jwt
│       ├── hash.js                   # hashPassword / comparePassword con bcrypt
│       ├── cookies.util.js           # nombre y opciones de la cookie currentUser
│       ├── validators.js             # isValidEmail, normalizeEmail, isIsoDateString, isDateOnlyString, toUtcIsoString
│       ├── reservationCode.util.js   # generarCodigoReserva(): AUR-XXXXXXXX sin caracteres ambiguos
│       ├── logger.js                 # logInfo/logError (silencioso en tests)
│       ├── errors.util.js            # HttpError y errores 400 / 401 / 403 / 404 / 409
│       └── responses.util.js         # helpers de respuesta uniforme (payload, message, listado paginado)
├── test/
│   ├── env.js                        # variables mínimas para la suite
│   ├── setup.js                      # MongoDB en memoria para los tests
│   ├── helpers.js                    # crearUsuarioConRol(role), crearEventoPublicado(usuario)
│   ├── config.test.js                # validación de JWT_EXPIRES_IN y JWT_SECRET al arrancar
│   ├── architecture.test.js          # reglas de dependencia entre capas y DTOs sin password (análisis del código)
│   ├── flujo-completo.test.js        # registro → login → evento → publicar → inscribirse → mis tickets → cancelar
│   ├── flujo-final.test.js           # los 10 casos del flujo completo de la entrega final, uno por test
│   ├── api.test.js                   # health, listado vacío, 404 de ruta, URL mal codificada y JSON inválido
│   ├── register.test.js              # registro: normalización, hash, rol del body ignorado, 400 y 409
│   ├── auth.test.js                  # login, current, logout, flujo completo
│   ├── passport.test.js              # estrategias registradas, separación app.js / config, JSON en fallos
│   ├── authorize.test.js             # matriz, middleware authorize, tabla 401 vs 403 de todas las rutas privadas
│   ├── events.test.js                # POST/PUT por rol, propiedad del recurso, validaciones, consulta pública
│   ├── events-rules.test.js          # fecha pasada, obligatorios, category normalizada, eventos finales inmutables
│   ├── events-status.test.js         # PATCH /status: transiciones, cancelar sin borrar, 409, propiedad
│   ├── events-list.test.js           # filtros, paginación, orden, 400 por parámetros inválidos
│   ├── tickets.test.js               # inscripción (casos de la consigna), correo, cancelación
│   ├── tickets-cupos.test.js         # cupos, concurrencia, my-tickets, inscritos por evento
│   └── users.test.js                 # rutas administrativas: listar usuarios y asignar roles
├── postman/
│   └── CafeAurora.postman_collection.json   # flujo completo con tests y variables encadenadas
├── .env.example
├── .gitignore
├── package.json
├── pnpm-workspace.yaml
└── README.md
```

### Flujo de la autenticación

```
POST /api/sessions/register
  → sessions.router        autenticarCon('register') → passport.authenticate('register')
  → passport.config        estrategia 'register': valida, normaliza, verifica unicidad, hashea
                           (utils/hash.js) y crea el usuario vía users.repository → users.dao
  → sessions.controller    responde 201 con req.user (DTO sin contraseña)

POST /api/sessions/login
  → sessions.router        autenticarCon('login') → passport.authenticate('login')
  → passport.config        estrategia 'login': findCredentialsByEmail + bcrypt.compare;
                           done(null, { id, email, role }) o done(null, false, 'Credenciales inválidas')
  → sessions.controller    firma el JWT (utils/jwt.js) y lo guarda en la cookie currentUser

GET /api/sessions/current
  → auth.middleware        auth = autenticarCon('current') → passport.authenticate('current')
  → passport.config        estrategia 'current' (passport-jwt): cookie currentUser o Bearer,
                           verifica firma/vigencia, done(null, { id, email, role })
  → sessions.controller    responde { id, email, role } desde req.user

POST /api/sessions/logout
  → sessions.controller    clearCookie('currentUser') y confirma (no pasa por Passport)
```

### Flujo de la autorización

```
POST /api/events  (cookie de un organizer)
  → auth                   estrategia 'current': JWT válido → req.user = { id, email, role: 'organizer' }
                           (sin cookie o token inválido → 401 "No autenticado")
  → authorize(organizer, admin)
                           'organizer' ∈ PERMISOS.CREAR_EVENTO → next()
                           (rol 'user' → 403 "No tienes permisos para realizar esta acción")
  → events.controller      crear(req.body, req.user)
  → events.service         whitelist de campos, validación, organizer = req.user.id
  → events.repository/dao  Event.create → DTO → 201

PUT /api/events/:eid  (cookie de otro organizer)
  → auth → authorize(organizer, admin)   pasa: el rol está permitido
  → events.service         carga el evento; evento.organizer !== req.user.id y no es admin
                           → 403 "Solo puedes modificar tus propios eventos"

PATCH /api/events/:eid/status  { status: 'published' }  (cookie del organizer dueño)
  → auth → authorize(organizer, admin)
  → events.service         status válido (400 si no) → carga el evento (404) → propiedad (403)
                           → no está en estado final (409) → transición permitida (409)
                           → fecha futura (409) → updateById condicionado al estado leído
  → events.repository/dao  findOneAndUpdate({ _id, status: { $in: ['draft'] } }) → DTO → 200

GET /api/events?status=published&category=workshop&page=2&limit=5  (sin sesión)
  → events.controller      listar(req.query)
  → events.service         valida y normaliza filtros, page, limit, sort (400 si algo es inválido)
  → events.repository/dao  find(consulta).sort().skip().limit() + countDocuments → { data, total }
  → events.controller      { status, data, page, limit, total, totalPages }

POST /api/events/:eid/tickets  { quantity: 2 }  (cookie de un user)
  → auth                   JWT válido → req.user = { id, email, role: 'user' }
  → tickets.controller     inscribir(req.params.eid, req.body, req.user)
  → tickets.service        quantity válida (400) → evento existe (404) → published y futuro (409)
                           → sin ticket activo del usuario (409) → cupo suficiente (409)
  → tickets.repository/dao Ticket.create → recuento hasta este ticket (deshace si sobra) → DTO
  → mail.service           enviarConfirmacionInscripcion (después de persistir, sin bloquear)
  → tickets.controller     201 con el ticket

PATCH /api/tickets/:tid/cancel  (cookie del dueño)
  → auth → tickets.service ticket existe (404) → es tuyo o admin (403) → no cancelado (409)
  → tickets.repository/dao findOneAndUpdate({ _id, status: { $in: activos } }, { status: 'cancelled', cancelledAt })
  → 200 con el ticket; el cupo queda libre porque ya no cuenta en la suma
```

## Modelos

- **User**: `first_name`, `last_name`, `email` (único, minúsculas), `password` (hash de bcrypt),
  `role` (`enum` de `roles.config.js`: `user` por defecto | `organizer` | `admin`), timestamps.
- **Event**: `title`, `description`, `category` (texto en minúsculas), `date`, `location`,
  `capacity` (≥ 1), `price` (≥ 0), `status` (`enum` de `events.config.js`: `draft` por defecto |
  `published` | `cancelled` | `finished`), `organizer` (referencia a `User`, tomado de la sesión),
  timestamps. Índices en `date`, `status + date`, `category` y `organizer` para los filtros del
  listado. Detalle en [Eventos: modelo, estados y reglas de negocio](#eventos-modelo-estados-y-reglas-de-negocio).
- **Ticket**: `user` (referencia a `User`, de la sesión), `event` (referencia a `Event`), `status`
  (`enum` de `tickets.config.js`: `confirmed` por defecto | `pending` | `cancelled`), `quantity`
  (entero 1..10), `reservationCode` (único), `cancelledAt` (`null` hasta cancelar), timestamps.
  Índices `event + status`, `user + createdAt`, `reservationCode` único y único parcial
  `user + event` sobre tickets activos. Detalle en
  [Inscripciones (tickets)](#inscripciones-tickets-modelo-cupos-cancelación-y-correo).

## Fuera del alcance y próximos pasos

Quedaron a propósito fuera de esta versión, como posibles iteraciones: refresh tokens (hoy la sesión
dura lo que el JWT, una hora), lista de espera cuando un evento se llena (el estado `pending` del
ticket ya está previsto), login con proveedores externos (Google/GitHub) como estrategias adicionales
de Passport, pagos para eventos con precio, y una interfaz web que consuma la API.
