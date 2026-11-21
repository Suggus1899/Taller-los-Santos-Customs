import { fromDbDate, isUniqueViolation, toDbDate, type Db } from '../db/client.js';
import { AppointmentStatus } from '../generated/prisma/enums.js';
import { writeAudit } from './audit.js';
import { upsertCustomer, type CustomerInput } from './customers.js';

export { AppointmentStatus };
export const appointmentStatuses = Object.values(AppointmentStatus);

/** El turno solicitado ya está ocupado (lo garantiza un índice único parcial en la BD). */
export class SlotTakenError extends Error {
  constructor() {
    super('El horario seleccionado ya no está disponible');
    this.name = 'SlotTakenError';
  }
}

export interface NewAppointment {
  customer: CustomerInput;
  vehicle?: string | undefined;
  serviceSlug: string;
  date: string;
  timeSlot: string;
  notes?: string | undefined;
}

export interface AppointmentSummary {
  serviceSlug: string;
  date: string;
  timeSlot: string;
  status: AppointmentStatus;
}

export interface AppointmentRow extends AppointmentSummary {
  id: number;
  notes: string | null;
  createdAt: Date;
  customer: { name: string; email: string; phone: string | null };
  vehicle: string | null;
}

export function createAppointmentsRepository(db: Db) {
  return {
    /** Crea la cita y devuelve su identificador público. */
    async create(input: NewAppointment): Promise<string> {
      try {
        return await db.$transaction(async (tx) => {
          const customerId = await upsertCustomer(tx, input.customer);
          const vehicle = input.vehicle
            ? await tx.vehicle.upsert({
                where: { customerId_description: { customerId, description: input.vehicle } },
                create: { customerId, description: input.vehicle },
                update: {},
                select: { id: true },
              })
            : null;
          const appointment = await tx.appointment.create({
            data: {
              customerId,
              vehicleId: vehicle?.id ?? null,
              serviceSlug: input.serviceSlug,
              scheduledDate: toDbDate(input.date),
              timeSlot: input.timeSlot,
              notes: input.notes ?? null,
            },
            select: { publicId: true },
          });
          return appointment.publicId;
        });
      } catch (error) {
        if (isUniqueViolation(error)) throw new SlotTakenError();
        throw error;
      }
    },

    async takenSlots(date: string): Promise<string[]> {
      const rows = await db.appointment.findMany({
        where: { scheduledDate: toDbDate(date), status: { not: AppointmentStatus.CANCELLED } },
        select: { timeSlot: true },
      });
      return rows.map((row) => row.timeSlot);
    },

    async findByPublicId(publicId: string): Promise<AppointmentSummary | null> {
      const row = await db.appointment.findUnique({
        where: { publicId },
        select: { serviceSlug: true, scheduledDate: true, timeSlot: true, status: true },
      });
      return row && { ...row, date: fromDbDate(row.scheduledDate) };
    },

    async list(status?: AppointmentStatus): Promise<AppointmentRow[]> {
      const rows = await db.appointment.findMany({
        where: status ? { status } : {},
        orderBy: [{ scheduledDate: 'desc' }, { timeSlot: 'desc' }],
        take: 200,
        include: {
          customer: { select: { name: true, email: true, phone: true } },
          vehicle: { select: { description: true } },
        },
      });
      return rows.map((row) => ({
        id: row.id,
        serviceSlug: row.serviceSlug,
        date: fromDbDate(row.scheduledDate),
        timeSlot: row.timeSlot,
        status: row.status,
        notes: row.notes,
        createdAt: row.createdAt,
        customer: row.customer,
        vehicle: row.vehicle?.description ?? null,
      }));
    },

    /** Cambia el estado y deja constancia en la auditoría. Devuelve false si no existe. */
    async updateStatus(id: number, status: AppointmentStatus, userId: number): Promise<boolean> {
      try {
        return await db.$transaction(async (tx) => {
          const current = await tx.appointment.findUnique({
            where: { id },
            select: { status: true },
          });
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
          return true;
        });
      } catch (error) {
        // Reactivar una cita cancelada cuyo turno ya ocupó otra persona.
        if (isUniqueViolation(error)) throw new SlotTakenError();
        throw error;
      }
    },

    countByStatus(status: AppointmentStatus): Promise<number> {
      return db.appointment.count({ where: { status } });
    },
  };
}

export type AppointmentsRepository = ReturnType<typeof createAppointmentsRepository>;
