import type { Db } from '../db/client.js';
import { createAppointmentsRepository } from './appointments.js';
import { writeAudit, type AuditEntry } from './audit.js';
import { createMessagesRepository } from './messages.js';
import { createQuotesRepository } from './quotes.js';
import { createUsersRepository } from './users.js';

export function createRepositories(db: Db) {
  return {
    appointments: createAppointmentsRepository(db),
    quotes: createQuotesRepository(db),
    messages: createMessagesRepository(db),
    users: createUsersRepository(db),
    audit: { write: (entry: AuditEntry) => writeAudit(db, entry) },
  };
}

export type Repositories = ReturnType<typeof createRepositories>;
