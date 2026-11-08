// DTOs de usuario: definen exactamente qué datos se exponen fuera de la capa de datos.
// Nunca incluyen la contraseña (ni en texto plano ni hasheada) ni campos internos.

// Representación pública completa (respuesta del registro)
export function toUserDTO(user) {
  return {
    id: user._id.toString(),
    first_name: user.first_name,
    last_name: user.last_name,
    email: user.email,
    role: user.role,
  };
}

// Datos mínimos de sesión: es el payload del JWT y la respuesta de /current.
// Acepta tanto un documento de Mongoose (_id) como un payload ya firmado (id).
export function toSessionDTO(user) {
  return {
    id: user.id ?? user._id.toString(),
    email: user.email,
    role: user.role,
  };
}
