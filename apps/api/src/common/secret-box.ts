import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * Cifrado simétrico (AES-256-GCM) para guardar llaves de terceros en la base de datos.
 * La clave sale de ENCRYPTION_KEY (o, si no existe, de JWT_ACCESS_SECRET).
 * Importante: si cambias esa variable, las llaves guardadas deben ingresarse de nuevo.
 */
function key(): Buffer {
  const source = process.env.ENCRYPTION_KEY || process.env.JWT_ACCESS_SECRET;
  if (!source) throw new Error('Falta ENCRYPTION_KEY');
  return createHash('sha256').update(source).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join(':');
}

export function decryptSecret(box: string): string {
  const [version, iv, tag, data] = box.split(':');
  if (version !== 'v1') throw new Error('Formato de secreto desconocido');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
}
