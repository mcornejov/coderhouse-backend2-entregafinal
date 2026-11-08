import { toUserDTO, toSessionDTO } from '../dto/user.dto.js';

// Repositorio de usuarios: abstrae el acceso a datos y entrega DTOs seguros
// hacia la capa de servicio, de modo que la contraseña nunca sube de esta capa
// salvo por el método explícito que usa el login para compararla.
export default class UsersRepository {
  constructor(dao) {
    this.dao = dao;
  }

  async create(userData) {
    const user = await this.dao.create(userData);
    return toUserDTO(user);
  }

  async existsByEmail(email) {
    const user = await this.dao.findByEmail(email);
    return user !== null;
  }

  async findById(id) {
    const user = await this.dao.findById(id);
    return user ? toUserDTO(user) : null;
  }

  async getAll() {
    const users = await this.dao.findAll();
    return users.map(toUserDTO);
  }

  async updateRoleById(id, role) {
    const user = await this.dao.updateRoleById(id, role);
    return user ? toUserDTO(user) : null;
  }

  // Único punto que expone el hash de la contraseña, separado del DTO público,
  // para que el servicio de login pueda compararlo con bcrypt.
  async findCredentialsByEmail(email) {
    const user = await this.dao.findByEmail(email);
    if (!user) return null;
    return { user: toSessionDTO(user), passwordHash: user.password };
  }
}
