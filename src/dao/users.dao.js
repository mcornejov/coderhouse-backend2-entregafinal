import User from '../models/User.js';

// DAO de usuarios: única capa que conoce Mongoose y el modelo User.
export default class UsersDao {
  async create(userData) {
    const user = await User.create(userData);
    return user.toObject();
  }

  async findByEmail(email) {
    return User.findOne({ email }).lean();
  }

  async findById(id) {
    return User.findById(id).lean();
  }

  async findAll() {
    return User.find().sort({ createdAt: 1 }).lean();
  }

  // runValidators: el nuevo rol debe estar en el enum del esquema
  async updateRoleById(id, role) {
    return User.findByIdAndUpdate(id, { role }, { returnDocument: 'after', runValidators: true }).lean();
  }
}
