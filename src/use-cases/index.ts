import { isUniqueViolation, type Db } from '../db/client.js';
import { labelOf, quoteExtras, quoteServices, vehicleTypes } from '../content/quote.js';
import { AppointmentStatus, type VehicleType } from '../generated/prisma/enums.js';
import { enqueue } from '../jobs/queue.js';
import { SlotTakenError, type AppointmentDetail } from '../repositories/appointments.js';
import { writeAudit } from '../repositories/audit.js';
import { upsertCustomer, upsertVehicle, type CustomerInput } from '../repositories/customers.js';
import type { Repositories } from '../repositories/index.js';
import { emails, type AppointmentEmailData } from '../services/email-templates.js';

/**
 * Casos de uso: cada operación de negocio en un solo lugar, dentro de UNA
 * transacción que incluye los datos y los correos que genera (encolados en la
 * tabla `jobs`). Las rutas HTTP solo validan, llaman aquí y responden.
 */
export interface UseCaseDeps {
  db: Db;
  repos: Repositories;
}

/** El servicio no existe o está desactivado. */
export class UnknownServiceError extends Error {
  constructor() {
    super('Servicio no disponible');
    this.name = 'UnknownServiceError';
  }
}

function emailData(a: AppointmentDetail): AppointmentEmailData {
  return {
    customerName: a.customer.name,
    customerEmail: a.customer.email,
    customerPhone: a.customer.phone,
    serviceName: a.serviceName,
    date: a.date,
    timeSlot: a.timeSlot,
    vehicle: a.vehicle,
    notes: a.notes,
  };
}

export function createUseCases({ db, repos }: UseCaseDeps) {
  return {
    async bookAppointment(input: {
      customer: CustomerInput & { phone: string };
      vehicle?: string | undefined;
      serviceSlug: string;
      date: string;
      timeSlot: string;
      notes?: string | undefined;
    }): Promise<string> {
      try {
        return await db.$transaction(async (tx) => {
          const service = await tx.service.findUnique({
            where: { slug: input.serviceSlug },
            select: { isActive: true },
          });
          if (!service?.isActive) throw new UnknownServiceError();

          const customerId = await upsertCustomer(tx, input.customer);
          const vehicleId = input.vehicle
            ? await upsertVehicle(tx, customerId, input.vehicle)
            : null;
          const { id, publicId } = await repos.appointments.insert(tx, {
            customerId,
            vehicleId,
            serviceSlug: input.serviceSlug,
            date: input.date,
            timeSlot: input.timeSlot,
            notes: input.notes ?? null,
          });

          const detail = await repos.appointments.findDetail(tx, id);
          if (detail) {
            await enqueue(tx, 'email.send', emails.appointmentReceived(emailData(detail)));
            await enqueue(tx, 'email.send', emails.staffNewAppointment(emailData(detail)));
          }
          return publicId;
        });
      } catch (error) {
        if (isUniqueViolation(error)) throw new SlotTakenError();
        throw error;
      }
    },

    /** Cambia el estado, lo audita y avisa al cliente si se confirma o cancela. */
    async changeAppointmentStatus(
      id: number,
      status: AppointmentStatus,
      userId: number,
    ): Promise<boolean> {
      try {
        return await db.$transaction(async (tx) => {
          const current = await repos.appointments.findDetail(tx, id);
          if (!current) return false;
          if (current.status === status) return true;

          await tx.appointment.update({ where: { id }, data: { status } });
          await writeAudit(tx, {
            action: 'STATUS_CHANGED',
            entityType: 'APPOINTMENT',
            entityId: id,
            userId,
            metadata: { from: current.status, to: status },
          });

          if (status === AppointmentStatus.CONFIRMED) {
            await enqueue(tx, 'email.send', emails.appointmentConfirmed(emailData(current)));
          } else if (status === AppointmentStatus.CANCELLED) {
            await enqueue(tx, 'email.send', emails.appointmentCancelled(emailData(current)));
          }
          return true;
        });
      } catch (error) {
        // Reactivar una cita cancelada cuyo turno ya ocupó otra persona.
        if (isUniqueViolation(error)) throw new SlotTakenError();
        throw error;
      }
    },

    async requestQuote(input: {
      customer: CustomerInput;
      vehicleType: string;
      serviceCode: string;
      extraCode: string;
      estimate: number;
      notes?: string | undefined;
    }): Promise<string> {
      const estimateLabel = `$${input.estimate}`;
      const summary =
        `Vehículo: ${labelOf(vehicleTypes, input.vehicleType)}\n` +
        `Servicio: ${labelOf(quoteServices, input.serviceCode)}\n` +
        `Extra: ${labelOf(quoteExtras, input.extraCode)}`;

      return db.$transaction(async (tx) => {
        const customerId = await upsertCustomer(tx, input.customer);
        const publicId = await repos.quotes.insert(tx, {
          customerId,
          vehicleType: input.vehicleType.toUpperCase() as VehicleType,
          serviceCode: input.serviceCode,
          extraCode: input.extraCode,
          estimateCents: input.estimate * 100,
          currency: 'USD',
          notes: input.notes ?? null,
        });
        const base = {
          customerName: input.customer.name,
          customerEmail: input.customer.email.toLowerCase(),
          summary,
          estimate: estimateLabel,
        };
        await enqueue(tx, 'email.send', emails.quoteReceived(base));
        await enqueue(
          tx,
          'email.send',
          emails.staffNewQuote({
            ...base,
            customerPhone: input.customer.phone ?? null,
            notes: input.notes ?? null,
          }),
        );
        return publicId;
      });
    },

    async sendContactMessage(input: { customer: CustomerInput; message: string }): Promise<void> {
      await db.$transaction(async (tx) => {
        const customerId = await upsertCustomer(tx, input.customer);
        await repos.messages.insert(tx, { customerId, message: input.message });
        await enqueue(
          tx,
          'email.send',
          emails.staffNewMessage({
            customerName: input.customer.name,
            customerEmail: input.customer.email.toLowerCase(),
            customerPhone: input.customer.phone ?? null,
            message: input.message,
          }),
        );
      });
    },

    /** Encola los recordatorios de las citas de `date` y las marca para no duplicar. */
    async scheduleReminders(date: string): Promise<number> {
      return db.$transaction(async (tx) => {
        const due = await repos.appointments.dueForReminder(tx, date);
        for (const appointment of due) {
          await enqueue(tx, 'email.send', emails.appointmentReminder(emailData(appointment)));
        }
        if (due.length) {
          await tx.appointment.updateMany({
            where: { id: { in: due.map((a) => a.id) } },
            data: { reminderSentAt: new Date() },
          });
        }
        return due.length;
      });
    },
  };
}

export type UseCases = ReturnType<typeof createUseCases>;
