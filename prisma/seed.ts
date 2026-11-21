/**
 * Datos de demostración para desarrollo (npm run db:seed).
 * No crea usuarios: usa `npm run create-admin` para no dejar credenciales conocidas.
 * Se niega a ejecutarse en producción.
 */
import { existsSync } from 'node:fs';
import { createPrismaClient } from '../src/db/client.js';
import { addDays, todayInShopTimezone } from '../src/services/schedule.js';

if (existsSync('.env')) process.loadEnvFile('.env');

if (process.env.NODE_ENV === 'production') {
  console.error('El seed de demostración no se ejecuta en producción.');
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('Define DATABASE_URL.');
const db = createPrismaClient(databaseUrl);

/** Próximo día laborable a partir de `offset` días. */
function businessDay(offset: number): Date {
  let iso = addDays(todayInShopTimezone(), offset);
  while ([0, 6].includes(new Date(`${iso}T00:00:00Z`).getUTCDay())) iso = addDays(iso, 1);
  return new Date(`${iso}T00:00:00Z`);
}

const customers = [
  { email: 'maria.gonzalez@example.com', name: 'María González', phone: '+58 412 111 2233' },
  { email: 'jose.ramirez@example.com', name: 'José Ramírez', phone: '+58 414 222 3344' },
  { email: 'ana.perez@example.com', name: 'Ana Pérez', phone: null },
];

async function main() {
  const [maria, jose, ana] = await Promise.all(
    customers.map((c) => db.customer.upsert({ where: { email: c.email }, create: c, update: {} })),
  );
  if (!maria || !jose || !ana) throw new Error('No se pudieron crear los clientes de ejemplo.');

  const corolla = await db.vehicle.upsert({
    where: { customerId_description: { customerId: maria.id, description: 'Toyota Corolla 2015' } },
    create: { customerId: maria.id, description: 'Toyota Corolla 2015', type: 'SEDAN' },
    update: {},
  });

  // Las citas se recrean en cada ejecución para que siempre estén en fechas futuras.
  await db.appointment.deleteMany({ where: { customerId: { in: [maria.id, jose.id] } } });
  await db.appointment.createMany({
    data: [
      {
        customerId: maria.id,
        vehicleId: corolla.id,
        serviceSlug: 'mantenimiento',
        scheduledDate: businessDay(1),
        timeSlot: '09:00',
        notes: 'Cambio de aceite y revisión general.',
      },
      {
        customerId: jose.id,
        serviceSlug: 'frenos',
        scheduledDate: businessDay(2),
        timeSlot: '14:00',
        status: 'CONFIRMED',
        notes: 'Chirrido al frenar.',
      },
      {
        customerId: jose.id,
        serviceSlug: 'diagnostico',
        scheduledDate: businessDay(3),
        timeSlot: '10:00',
      },
    ],
  });

  await db.quoteRequest.deleteMany({ where: { customerId: ana.id } });
  await db.quoteRequest.create({
    data: {
      customerId: ana.id,
      vehicleType: 'SUV',
      serviceCode: 'full',
      extraCode: 'ac',
      estimateCents: 19500,
      notes: 'Ford Explorer 2018',
    },
  });

  await db.contactMessage.deleteMany({ where: { customerId: ana.id } });
  await db.contactMessage.create({
    data: {
      customerId: ana.id,
      message: '¿Trabajan con vehículos híbridos? Tengo un Toyota Prius 2019.',
    },
  });

  console.info('Datos de demostración cargados.');
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => void db.$disconnect());
