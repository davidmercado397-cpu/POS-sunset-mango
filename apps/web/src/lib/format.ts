const cop = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

/** Formatea pesos colombianos sin decimales: $ 12.500 */
export const formatCOP = (value: number) => cop.format(value);
