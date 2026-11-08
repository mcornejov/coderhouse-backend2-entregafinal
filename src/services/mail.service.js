import { logInfo, logError } from '../utils/logger.js';

// Servicio de correo: arma y envía las notificaciones. No conoce HTTP ni la base de datos; recibe el
// transporte por inyección (en producción el de Nodemailer, en tests uno observable).
// Un fallo del correo nunca rompe la operación de negocio que lo originó: se registra y sigue.

const FORMATO_FECHA = new Intl.DateTimeFormat('es-CL', {
  dateStyle: 'full',
  timeStyle: 'short',
  timeZone: 'America/Santiago',
});

function escaparHtml(texto) {
  return String(texto).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export default class MailService {
  /**
   * @param {{ sendMail: (mensaje: object) => Promise<object> }} transporter transporte de Nodemailer
   * @param {{ from: string, configured: boolean }} opciones remitente y si hay SMTP real
   */
  constructor(transporter, { from, configured }) {
    this.transporter = transporter;
    this.from = from;
    this.configured = configured;
  }

  /**
   * Correo de cancelación de inscripción. Mismas garantías que la confirmación: nunca lanza.
   * @param {{ destinatario: string, ticket: object, evento: object }} datos
   * @returns {Promise<boolean>}
   */
  async enviarCancelacionInscripcion({ destinatario, ticket, evento }) {
    const fecha = FORMATO_FECHA.format(new Date(evento.date));
    const mensaje = {
      from: this.from,
      to: destinatario,
      subject: `Inscripción cancelada: ${evento.title}`,
      text: [
        `Tu inscripción a "${evento.title}" (${fecha}) quedó cancelada.`,
        '',
        `Código de reserva: ${ticket.reservationCode}`,
        'El cupo quedó disponible para otras personas. Si cambias de idea y hay lugar, puedes volver a inscribirte desde la plataforma.',
        '',
        'Café Aurora',
      ].join('\n'),
      html: `
        <p>Tu inscripción a <strong>${escaparHtml(evento.title)}</strong> (${escaparHtml(fecha)}) quedó cancelada.</p>
        <p>Código de reserva: <strong>${escaparHtml(ticket.reservationCode)}</strong></p>
        <p>El cupo quedó disponible para otras personas. Si cambias de idea y hay lugar, puedes volver a inscribirte desde la plataforma.</p>
        <p>Café Aurora</p>`,
    };
    return this.#enviar(mensaje, `cancelación (${ticket.reservationCode})`);
  }

  /**
   * Correo de confirmación de inscripción. Devuelve true si el transporte aceptó el mensaje,
   * false si falló (ya registrado); nunca lanza.
   * @param {{ destinatario: string, ticket: object, evento: object }} datos
   * @returns {Promise<boolean>}
   */
  async enviarConfirmacionInscripcion({ destinatario, ticket, evento }) {
    const fecha = FORMATO_FECHA.format(new Date(evento.date));
    const lugares = ticket.quantity === 1 ? '1 lugar' : `${ticket.quantity} lugares`;

    const mensaje = {
      from: this.from,
      to: destinatario,
      subject: `Inscripción confirmada: ${evento.title}`,
      text: [
        `¡Hola! Tu inscripción a "${evento.title}" quedó confirmada.`,
        '',
        `Código de reserva: ${ticket.reservationCode}`,
        `Fecha: ${fecha}`,
        `Lugar: ${evento.location}`,
        `Cantidad: ${lugares}`,
        '',
        'Presenta este código al llegar. Si no puedes asistir, cancela tu inscripción desde la plataforma para liberar el cupo.',
        '',
        'Café Aurora',
      ].join('\n'),
      html: `
        <p>¡Hola! Tu inscripción a <strong>${escaparHtml(evento.title)}</strong> quedó confirmada.</p>
        <ul>
          <li>Código de reserva: <strong>${escaparHtml(ticket.reservationCode)}</strong></li>
          <li>Fecha: ${escaparHtml(fecha)}</li>
          <li>Lugar: ${escaparHtml(evento.location)}</li>
          <li>Cantidad: ${escaparHtml(lugares)}</li>
        </ul>
        <p>Presenta este código al llegar. Si no puedes asistir, cancela tu inscripción desde la plataforma para liberar el cupo.</p>
        <p>Café Aurora</p>`,
    };

    return this.#enviar(mensaje, `confirmación (${ticket.reservationCode})`);
  }

  // Envía y registra el resultado. Un fallo del transporte se informa como false, nunca como excepción.
  async #enviar(mensaje, descripcion) {
    try {
      await this.transporter.sendMail(mensaje);
      logInfo(this.configured
        ? `Correo de ${descripcion} enviado a ${mensaje.to}`
        : `Correo de ${descripcion} para ${mensaje.to} registrado sin enviar: MAIL_HOST no configurado`);
      return true;
    } catch (error) {
      logError(`No se pudo enviar el correo de ${descripcion} a ${mensaje.to}: ${error.message}`);
      return false;
    }
  }
}
