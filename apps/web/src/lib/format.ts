const cop = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const qty = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 3 });
const dateTime = new Intl.DateTimeFormat('es-CO', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Bogota' });
const dateOnly = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeZone: 'America/Bogota' });
const timeOnly = new Intl.DateTimeFormat('es-CO', { timeStyle: 'short', timeZone: 'America/Bogota' });

/** Formatea pesos colombianos sin decimales: $ 12.500 */
export const formatCOP = (value: number) => cop.format(value);
export const formatQty = (value: number) => qty.format(value);
export const formatDateTime = (value: string | Date) => dateTime.format(new Date(value));
export const formatDate = (value: string | Date) => dateOnly.format(new Date(value));
export const formatTime = (value: string | Date) => timeOnly.format(new Date(value));

/** Fecha de hoy (YYYY-MM-DD) en Colombia. */
export const todayISO = () => new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);

export const PAYMENT_LABELS: Record<string, string> = { CASH: 'Efectivo', TRANSFER: 'Transferencia', QR_BOLD: 'QR / Bold' };
