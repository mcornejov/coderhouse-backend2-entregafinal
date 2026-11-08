import { esRolValido, USER_ROLES } from '../config/roles.config.js';
import { BadRequestError, NotFoundError } from '../utils/errors.util.js';

// Capa de negocio de usuarios para la administración. El registro y el login no pasan
// por aquí (viven en las estrategias de Passport); esto es lo que hace un admin.
export default class UsersService {
  constructor(repository) {
    this.repository = repository;
  }

  async listar() {
    return this.repository.getAll();
  }

  /**
   * Cambia el rol de un usuario. El rol debe ser uno de los definidos en la matriz y el
   * admin no puede cambiar el suyo: evita que la instalación quede sin administradores
   * por error. El cambio rige en el próximo login del usuario afectado: el JWT ya
   * emitido conserva el rol anterior hasta que expire (sesión sin estado).
   * @param {string} id usuario a modificar
   * @param {unknown} role nuevo rol
   * @param {{ id: string }} solicitante admin autenticado (req.user)
   */
  async asignarRol(id, role, solicitante) {
    if (!esRolValido(role)) {
      throw new BadRequestError(`El rol debe ser uno de: ${USER_ROLES.join(', ')}`);
    }

    // Se carga primero el usuario para comparar ids ya canónicos (los del DTO): el id de
    // la URL admite variantes que la base acepta como el mismo documento (hexadecimal en
    // mayúsculas) y una comparación de texto directa las dejaría pasar.
    const usuario = await this.repository.findById(id);
    if (!usuario) {
      throw new NotFoundError(`No existe un usuario con id ${id}`);
    }
    if (solicitante && usuario.id === solicitante.id) {
      throw new BadRequestError('No puedes cambiar tu propio rol');
    }

    const actualizado = await this.repository.updateRoleById(usuario.id, role);
    if (!actualizado) {
      // El usuario desapareció entre la lectura y la escritura
      throw new NotFoundError(`No existe un usuario con id ${id}`);
    }
    return actualizado;
  }
}
