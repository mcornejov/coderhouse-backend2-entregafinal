import mongoose from 'mongoose';
import { USER_ROLES, DEFAULT_ROLE } from '../config/roles.config.js';

// Los roles y la matriz de permisos viven en config/roles.config.js. El valor por defecto
// es el de menor privilegio; organizer y admin solo se asignan por un proceso controlado
// (ruta administrativa o script), nunca desde el registro público.
export { USER_ROLES };

const userSchema = new mongoose.Schema(
  {
    first_name: { type: String, required: true, trim: true },
    last_name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    // Siempre almacena el hash generado con bcrypt, nunca la contraseña original
    password: { type: String, required: true },
    role: { type: String, enum: USER_ROLES, default: DEFAULT_ROLE },
  },
  { timestamps: true }
);

const User = mongoose.model('User', userSchema);

export default User;
