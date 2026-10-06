/**
 * Identificador de ingreso: un correo (cajero1@negocio1.com) o un usuario simple (superadmin).
 * Se guarda en minúsculas y es único en toda la plataforma.
 */
export const LOGIN_ID_REGEX = /^(?:[a-z0-9._-]{3,40}|[a-z0-9._%+-]{1,64}@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,})$/i;
export const LOGIN_ID_MESSAGE = 'Usa un correo (ej. cajero1@minegocio.com) o un usuario de 3 a 40 letras, números, punto o guion';

export const normalizeLoginId = (value: string) => value.trim().toLowerCase();
