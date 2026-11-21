import { site } from '../config/site.js';
import type { JobPayload } from '../jobs/queue.js';
import { STAFF_RECIPIENT } from '../jobs/queue.js';

type Email = JobPayload<'email.send'>;

const dateFormatter = new Intl.DateTimeFormat(site.locale, {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});

const longDate = (iso: string) => dateFormatter.format(new Date(`${iso}T00:00:00Z`));

function timeLabel(slot: string): string {
  const [h = 0, m = 0] = slot.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'a. m.' : 'p. m.'}`;
}

const signature = `\n\n${site.name}\n${site.address.display}\nTel. ${site.contact.phoneDisplay} · ${site.contact.email}\n${site.hours.display}`;

export interface AppointmentEmailData {
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  serviceName: string;
  date: string;
  timeSlot: string;
  vehicle?: string | null;
  notes?: string | null;
}

export const emails = {
  appointmentReceived(a: AppointmentEmailData): Email {
    return {
      to: a.customerEmail,
      subject: `Recibimos tu solicitud de cita – ${site.name}`,
      text:
        `Hola, ${a.customerName}:\n\nRecibimos tu solicitud de cita. Te confirmaremos pronto.\n\n` +
        `Servicio: ${a.serviceName}\nFecha: ${longDate(a.date)}\nHora: ${timeLabel(a.timeSlot)}\n\n` +
        `Si necesitas cambiarla, responde a este correo o llámanos.${signature}`,
    };
  },

  appointmentConfirmed(a: AppointmentEmailData): Email {
    return {
      to: a.customerEmail,
      subject: `Cita confirmada: ${longDate(a.date)} – ${site.name}`,
      text:
        `Hola, ${a.customerName}:\n\nTu cita está confirmada.\n\n` +
        `Servicio: ${a.serviceName}\nFecha: ${longDate(a.date)}\nHora: ${timeLabel(a.timeSlot)}\n\n` +
        `Te recomendamos llegar 10 minutos antes y traer los documentos del vehículo.${signature}`,
    };
  },

  appointmentCancelled(a: AppointmentEmailData): Email {
    return {
      to: a.customerEmail,
      subject: `Cita cancelada – ${site.name}`,
      text:
        `Hola, ${a.customerName}:\n\nTu cita del ${longDate(a.date)} a las ${timeLabel(a.timeSlot)} fue cancelada.\n` +
        `Si quieres reprogramarla, puedes agendar de nuevo en nuestra web o responder a este correo.${signature}`,
    };
  },

  appointmentReminder(a: AppointmentEmailData): Email {
    return {
      to: a.customerEmail,
      subject: `Recordatorio: tu cita es mañana – ${site.name}`,
      text:
        `Hola, ${a.customerName}:\n\nTe recordamos tu cita de mañana.\n\n` +
        `Servicio: ${a.serviceName}\nFecha: ${longDate(a.date)}\nHora: ${timeLabel(a.timeSlot)}\n\n` +
        `Si no puedes asistir, avísanos para liberar el turno.${signature}`,
    };
  },

  staffNewAppointment(a: AppointmentEmailData): Email {
    return {
      to: STAFF_RECIPIENT,
      replyTo: a.customerEmail,
      subject: `Nueva cita: ${a.date} ${a.timeSlot} – ${a.serviceName}`,
      text:
        `Cliente: ${a.customerName}\nCorreo: ${a.customerEmail}\nTeléfono: ${a.customerPhone ?? '-'}\n` +
        `Vehículo: ${a.vehicle ?? '-'}\nServicio: ${a.serviceName}\nFecha: ${a.date} ${a.timeSlot}\nNotas: ${a.notes ?? '-'}`,
    };
  },

  quoteReceived(q: {
    customerName: string;
    customerEmail: string;
    summary: string;
    estimate: string;
  }): Email {
    return {
      to: q.customerEmail,
      subject: `Tu cotización: ${q.estimate} – ${site.name}`,
      text:
        `Hola, ${q.customerName}:\n\nGracias por tu solicitud. Este es el precio estimado:\n\n${q.summary}\n` +
        `Total estimado: ${q.estimate}\n\nEs un precio referencial; te contactaremos para confirmarlo tras revisar tu vehículo.${signature}`,
    };
  },

  staffNewQuote(q: {
    customerName: string;
    customerEmail: string;
    customerPhone: string | null;
    summary: string;
    estimate: string;
    notes: string | null;
  }): Email {
    return {
      to: STAFF_RECIPIENT,
      replyTo: q.customerEmail,
      subject: `Nueva cotización: ${q.estimate}`,
      text:
        `Cliente: ${q.customerName}\nCorreo: ${q.customerEmail}\nTeléfono: ${q.customerPhone ?? '-'}\n\n` +
        `${q.summary}\nEstimado: ${q.estimate}\nNotas: ${q.notes ?? '-'}`,
    };
  },

  staffNewMessage(m: {
    customerName: string;
    customerEmail: string;
    customerPhone: string | null;
    message: string;
  }): Email {
    return {
      to: STAFF_RECIPIENT,
      replyTo: m.customerEmail,
      subject: `Nuevo mensaje de ${m.customerName}`,
      text: `Nombre: ${m.customerName}\nCorreo: ${m.customerEmail}\nTeléfono: ${m.customerPhone ?? '-'}\n\n${m.message}`,
    };
  },
};
