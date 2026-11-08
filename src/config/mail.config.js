import nodemailer from 'nodemailer';
import config from './env.config.js';

// Transporte de correo. Con MAIL_HOST configurado, SMTP real con las credenciales del entorno.
// Sin MAIL_HOST, el transporte `jsonTransport` de Nodemailer "envía" devolviendo el mensaje
// como JSON (no sale nada a la red): sirve para desarrollar y para los tests.
export function crearTransporter(mail = config.mail) {
  if (!mail.configured) {
    return nodemailer.createTransport({ jsonTransport: true });
  }
  return nodemailer.createTransport({
    host: mail.host,
    port: mail.port,
    // 465 es SMTP sobre TLS implícito; 587/25 negocian STARTTLS
    secure: mail.port === 465,
    auth: mail.user ? { user: mail.user, pass: mail.pass } : undefined,
  });
}

// Instancia única que comparte la aplicación (los tests la observan para verificar los envíos)
export const transporter = crearTransporter();
