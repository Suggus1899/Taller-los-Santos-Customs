import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

/**
 * Hash de contraseñas con scrypt (incluido en Node, sin dependencias nativas).
 * Formato almacenado: `scrypt$N$r$p$salt$hash` (salt y hash en base64url), lo que
 * permite subir el coste en el futuro sin invalidar los hashes existentes.
 */
const PARAMS = { N: 2 ** 15, r: 8, p: 1 } as const;
const KEY_LENGTH = 64;
const MAX_MEM = 64 * 1024 * 1024;

function derive(password: string, salt: Buffer, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password.normalize('NFKC'),
      salt,
      KEY_LENGTH,
      { ...options, maxmem: MAX_MEM },
      (err, key) => (err ? reject(err) : resolve(key)),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, PARAMS);
  return [
    'scrypt',
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString('base64url'),
    key.toString('base64url'),
  ].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm, n, r, p, salt, hash] = stored.split('$');
  if (algorithm !== 'scrypt' || !n || !r || !p || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64url');
  const actual = await derive(password, Buffer.from(salt, 'base64url'), {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/**
 * Hash ficticio para igualar el tiempo de respuesta cuando el usuario no existe
 * y no revelar qué nombres de usuario son válidos.
 */
export const DUMMY_HASH = [
  'scrypt',
  PARAMS.N,
  PARAMS.r,
  PARAMS.p,
  Buffer.alloc(16).toString('base64url'),
  Buffer.alloc(KEY_LENGTH).toString('base64url'),
].join('$');
