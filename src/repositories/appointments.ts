import { fromDbDate, toDbDate, type Db, type Prisma } from '../db/client.js';
import { AppointmentStatus } from '../generated/prisma/enums.js';

export { AppointmentStatus };
export const appointmentStatuses = Object.values(AppointmentStatus);

/** El turno solicitado ya está ocupado (lo garantiza un índice único parcial en la BD). */
export class SlotTakenError extends Error {
  constructor() {
    super('El horario seleccionado ya no está disponible');
    this.name = 'SlotTakenError';
  }
}

export interface AppointmentSummary {
  serviceSlug: string;
  serviceName: string;
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

/** Datos completos de una cita para construir correos. */
export interface AppointmentDetail extends AppointmentRow {
  reminderSentAt: Date | null;
}

const detailSelect = {
  id: true,
  serviceSlug: true,
  scheduledDate: true,
  timeSlot: true,
  status: true,
  notes: true,
  createdAt: true,
  reminderSentAt: true,
  service: { select: { name: true } },
  customer: { select: { name: true, email: true, phone: true } },
  vehicle: { select: { description: true } },
} satisfies Prisma.AppointmentSelect;

type DetailRecord = Prisma.AppointmentGetPayload<{ select: typeof detailSelect }>;

function toDetail(row: DetailRecord): AppointmentDetail {
  return {
    id: row.id,
    serviceSlug: row.serviceSlug,
    serviceName: row.service.name,
    date: fromDbDate(row.scheduledDate),
    timeSlot: row.timeSlot,
    status: row.status,
    notes: row.notes,
    createdAt: row.createdAt,
    reminderSentAt: row.reminderSentAt,
    customer: row.customer,
    vehicle: row.vehicle?.description ?? null,
  };
}

type Client = Db | Prisma.TransactionClient;

export function createAppointmentsRepository(db: Db) {
  return {
    /** Inserta la cita (debe ejecutarse dentro de una transacción del caso de uso). */
    async insert(
      tx: Prisma.TransactionClient,
      input: {
        customerId: number;
        vehicleId: number | null;
        serviceSlug: string;
        date: string;
        timeSlot: string;
        notes: string | null;
      },
    ): Promise<{ id: number; publicId: string }> {
      return tx.appointment.create({
        data: {
          customerId: input.customerId,
          vehicleId: input.vehicleId,
          serviceSlug: input.serviceSlug,
          scheduledDate: toDbDate(input.date),
          timeSlot: input.timeSlot,
          notes: input.notes,
        },
        select: { id: true, publicId: true },
      });
    },

    async findDetail(client: Client, id: number): Promise<AppointmentDetail | null> {
      const row = await client.appointment.findUnique({ where: { id }, select: detailSelect });
      return row && toDetail(row);
    },

    /** Citas de un día que aún necesitan recordatorio. */
    async dueForReminder(client: Client, date: string): Promise<AppointmentDetail[]> {
      const rows = await client.appointment.findMany({
        where: {
          scheduledDate: toDbDate(date),
          status: { in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED] },
          reminderSentAt: null,
        },
        select: detailSelect,
      });
      return rows.map(toDetail);
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
        select: {
          serviceSlug: true,
          scheduledDate: true,
          timeSlot: true,
          status: true,
          service: { select: { name: true } },
        },
      });
      return (
        row && {
          serviceSlug: row.serviceSlug,
          serviceName: row.service.name,
          date: fromDbDate(row.scheduledDate),
          timeSlot: row.timeSlot,
          status: row.status,
        }
      );
    },

    async list(status?: AppointmentStatus): Promise<AppointmentRow[]> {
      const rows = await db.appointment.findMany({
        where: status ? { status } : {},
        orderBy: [{ scheduledDate: 'desc' }, { timeSlot: 'desc' }],
        take: 200,
        select: detailSelect,
      });
      return rows.map(toDetail);
    },

    countByStatus(status: AppointmentStatus): Promise<number> {
      return db.appointment.count({ where: { status } });
    },
  };
}

export type AppointmentsRepository = ReturnType<typeof createAppointmentsRepository>;
