import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import { Strategy as JwtStrategy, ExtractJwt } from 'passport-jwt';
import { randomUUID } from 'node:crypto';
import config from './env.config.js';
import UsersDao from '../dao/users.dao.js';
import UsersRepository from '../repositories/users.repository.js';
import { hashPassword, comparePassword } from '../utils/hash.js';
import { JWT_ALGORITHM } from '../utils/jwt.js';
import { AUTH_COOKIE_NAME } from '../utils/cookies.util.js';
import { toSessionDTO } from '../dto/user.dto.js';
import { BadRequestError, ConflictError } from '../utils/errors.util.js';
import {
  isNonEmptyString,
  isValidEmail,
  isPasswordTooLong,
  normalizeEmail,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_BYTES,
} from '../utils/validators.js';

// Configuración centralizada de Passport. Aquí viven TODAS las estrategias de
// autenticación; app.js solo llama a configurarPassport() y passport.initialize().
// Para sumar un provider externo (Google, GitHub) basta con agregar su estrategia
// en crearEstrategias(): ni app.js ni las rutas existentes cambian.

// Campos que el registro público acepta del cliente. El rol NO está en la lista:
// siempre se asigna el valor por defecto del modelo (menor privilegio).
const CAMPOS_REGISTRO = ['first_name', 'last_name', 'email', 'password'];

// passport-local busca por defecto "username"; aquí el identificador es el email.
// passReqToCallback permite leer el body completo: el registro necesita nombre y
// apellido, y ambas estrategias validan las credenciales desde req.body (passport-local
// también las aceptaría por query string, lo que dejaría contraseñas en URLs y logs).
const OPCIONES_LOCAL = {
  usernameField: 'email',
  passwordField: 'password',
  passReqToCallback: true,
};

// Hash señuelo: se genera una sola vez a partir de un valor aleatorio y no
// corresponde a ningún usuario. Sirve para que el login tarde lo mismo exista o
// no el email, evitando que el tiempo de respuesta delate qué correos están registrados.
let hashSenueloPromesa = null;
function obtenerHashSenuelo() {
  hashSenueloPromesa ??= hashPassword(randomUUID());
  return hashSenueloPromesa;
}

// Extrae el JWT de la cookie de sesión. Se combina con el extractor Bearer para
// clientes que no manejan cookies (apps móviles, herramientas de prueba).
function extraerDesdeCookie(req) {
  const token = req.cookies?.[AUTH_COOKIE_NAME];
  return typeof token === 'string' && token.length > 0 ? token : null;
}

/**
 * Crea las estrategias de autenticación. Recibe el repositorio de usuarios por
 * inyección de dependencias para poder probarlas con un repositorio de prueba.
 * @param {UsersRepository} usersRepository
 * @returns {{ register: LocalStrategy, login: LocalStrategy, current: JwtStrategy }}
 */
export function crearEstrategias(usersRepository) {
  // Estrategia 'register': validación, normalización, unicidad, hash y rol por defecto.
  // Entrega el usuario creado (DTO sin contraseña) o el error de negocio correspondiente.
  // Firma de passport-local con passReqToCallback: (req, username, password, done).
  // username/password se ignoran: las credenciales se toman solo de req.body (ver arriba).
  const register = new LocalStrategy(OPCIONES_LOCAL, async (req, _email, _password, done) => {
    try {
      const datos = req.body ?? {};

      // 1. Presencia de campos obligatorios
      const faltantes = CAMPOS_REGISTRO.filter((campo) => !isNonEmptyString(datos[campo]));
      if (faltantes.length > 0) {
        throw new BadRequestError('Faltan campos obligatorios');
      }

      // 2. Formato de email y largo de contraseña
      if (!isValidEmail(datos.email)) {
        throw new BadRequestError('El email no tiene un formato válido');
      }
      if (datos.password.length < PASSWORD_MIN_LENGTH) {
        throw new BadRequestError(`La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres`);
      }
      if (isPasswordTooLong(datos.password)) {
        throw new BadRequestError(`La contraseña no puede superar los ${PASSWORD_MAX_BYTES} bytes`);
      }

      // 3. Normalización y unicidad del email
      const emailNormalizado = normalizeEmail(datos.email);
      if (await usersRepository.existsByEmail(emailNormalizado)) {
        throw new ConflictError('El email ya está registrado');
      }

      // 4. La contraseña nunca se persiste en texto plano
      const passwordHash = await hashPassword(datos.password);

      // 5. Persistencia con whitelist de campos (el rol queda en su valor por defecto)
      const usuario = await usersRepository.create({
        first_name: datos.first_name.trim(),
        last_name: datos.last_name.trim(),
        email: emailNormalizado,
        password: passwordHash,
      });

      return done(null, usuario);
    } catch (error) {
      return done(error);
    }
  });

  // Estrategia 'login': verifica las credenciales y entrega { id, email, role }.
  // No firma el JWT ni toca la cookie: eso lo hace el controller tras el éxito.
  // Cualquier discrepancia falla con el mismo mensaje genérico (no se revela si
  // el email existe o si falló la contraseña).
  const login = new LocalStrategy(OPCIONES_LOCAL, async (req, _email, _password, done) => {
    try {
      const { email, password } = req.body ?? {};
      if (!isNonEmptyString(email) || !isNonEmptyString(password)) {
        throw new BadRequestError('Faltan campos obligatorios');
      }

      const credenciales = await usersRepository.findCredentialsByEmail(normalizeEmail(email));

      // Se compara aunque el usuario no exista (ver hash señuelo más arriba)
      const hash = credenciales?.passwordHash ?? (await obtenerHashSenuelo());
      const coincide = await comparePassword(password, hash);

      if (!credenciales || !coincide) {
        return done(null, false, { message: 'Credenciales inválidas' });
      }

      return done(null, credenciales.user);
    } catch (error) {
      return done(error);
    }
  });

  // Estrategia 'current': lee el JWT de la cookie currentUser (o del header Bearer),
  // verifica firma y vigencia con el secreto de entorno y entrega { id, email, role }.
  // Si no hay token o es inválido/expirado, passport-jwt falla y la ruta responde 401.
  const current = new JwtStrategy(
    {
      jwtFromRequest: ExtractJwt.fromExtractors([
        extraerDesdeCookie,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      secretOrKey: config.jwtSecret,
      // Algoritmo fijado por el servidor: nunca se toma del header del token
      algorithms: [JWT_ALGORITHM],
    },
    (payload, done) => {
      // La firma ya fue verificada; falta comprobar que el payload tenga la forma que
      // emite este servidor. Un token firmado con el mismo secreto pero con otro
      // contenido no autentica (401), en vez de provocar un error interno.
      if (!isNonEmptyString(payload?.id) || !isNonEmptyString(payload?.email) || !isNonEmptyString(payload?.role)) {
        return done(null, false);
      }
      return done(null, toSessionDTO(payload));
    }
  );

  return { register, login, current };
}

/**
 * Registra las estrategias en Passport. Se llama una sola vez desde app.js.
 * @param {UsersRepository} [usersRepository] repositorio real por defecto
 * @returns {typeof passport}
 */
export function configurarPassport(usersRepository = new UsersRepository(new UsersDao())) {
  const estrategias = crearEstrategias(usersRepository);

  for (const [nombre, estrategia] of Object.entries(estrategias)) {
    passport.use(nombre, estrategia);
  }

  return passport;
}
