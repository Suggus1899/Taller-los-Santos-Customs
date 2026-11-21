import type { Prisma } from '../db/client.js';

export interface CustomerInput {
  name: string;
  email: string;
  phone?: string | undefined;
}

/**
 * Busca al cliente por correo o lo crea. Si ya existe, actualiza nombre y teléfono
 * con los datos más recientes para que el equipo vea la información de contacto vigente.
 * Debe llamarse dentro de la transacción del caso de uso.
 */
export async function upsertCustomer(
  tx: Prisma.TransactionClient,
  input: CustomerInput,
): Promise<number> {
  const email = input.email.toLowerCase();
  const customer = await tx.customer.upsert({
    where: { email },
    create: { email, name: input.name, phone: input.phone ?? null },
    update: { name: input.name, ...(input.phone ? { phone: input.phone } : {}) },
    select: { id: true },
  });
  return customer.id;
}

/** Vehículo del cliente identificado por su descripción ("Toyota Corolla 2015"). */
export async function upsertVehicle(
  tx: Prisma.TransactionClient,
  customerId: number,
  description: string,
): Promise<number> {
  const vehicle = await tx.vehicle.upsert({
    where: { customerId_description: { customerId, description } },
    create: { customerId, description },
    update: {},
    select: { id: true },
  });
  return vehicle.id;
}
