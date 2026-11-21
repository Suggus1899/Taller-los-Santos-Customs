/**
 * Crea (o actualiza) un usuario del panel.
 *
 *   npm run create-admin -- --username frank --role ADMIN
 *
 * La contraseña se pide por consola sin mostrarla, o se toma de ADMIN_PASSWORD
 * (útil en despliegues automatizados). Nunca se pasa como argumento, porque
 * quedaría en el historial de la terminal.
 */
import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { createPrismaClient } from '../src/db/client.js';
import { UserRole } from '../src/generated/prisma/enums.js';
import { createUsersRepository } from '../src/repositories/users.js';
import { hashPassword } from '../src/services/password.js';

const MIN_PASSWORD_LENGTH = 12;

async function promptHidden(question: string): Promise<string> {
  if (!stdin.isTTY) throw new Error('Sin terminal interactiva: define ADMIN_PASSWORD.');
  const rl = createInterface({ input: stdin, output: stdout, terminal: true });
  // Oculta lo que se escribe sustituyendo la salida del readline.
  const write = (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput;
  (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s: string) => {
    if (s.includes(question)) write.call(rl, s);
  };
  const answer = await rl.question(question);
  rl.close();
  stdout.write('\n');
  return answer;
}

async function main() {
  const { values } = parseArgs({
    options: {
      username: { type: 'string', short: 'u' },
      role: { type: 'string', default: 'ADMIN' },
    },
  });

  const username = z
    .string({ error: 'Indica --username' })
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9._-]{3,64}$/, 'Usuario: 3-64 caracteres (letras, números, . _ -)')
    .parse(values.username);
  const role = z.enum(UserRole).parse(values.role?.toUpperCase());

  const password = process.env.ADMIN_PASSWORD ?? (await promptHidden('Contraseña: '));
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
  }
  if (!process.env.ADMIN_PASSWORD && (await promptHidden('Repite la contraseña: ')) !== password) {
    throw new Error('Las contraseñas no coinciden.');
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('Define DATABASE_URL.');
  const db = createPrismaClient(databaseUrl);
  try {
    const result = await createUsersRepository(db).upsert({
      username,
      passwordHash: await hashPassword(password),
      role,
    });
    console.info(
      `Usuario "${username}" ${result === 'created' ? 'creado' : 'actualizado'} con rol ${role}.`,
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  if (error instanceof z.ZodError) console.error(z.prettifyError(error));
  else console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
