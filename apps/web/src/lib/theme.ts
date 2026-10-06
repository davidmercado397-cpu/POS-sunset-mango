/** Aplica los colores de marca del negocio a las variables CSS. */
export function applyBrand(primary?: string | null, secondary?: string | null) {
  const root = document.documentElement;
  const p = isHex(primary) ? primary : '#f97316';
  const s = isHex(secondary) ? secondary : '#7c2d12';
  root.style.setProperty('--brand', p);
  root.style.setProperty('--brand-dark', s);
  root.style.setProperty('--brand-contrast', contrastText(p));
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', p);
}

function isHex(value?: string | null): value is string {
  return !!value && /^#[0-9a-fA-F]{6}$/.test(value);
}

/** Texto blanco o negro según la luminancia del color de fondo. */
function contrastText(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.6 ? '#111827' : '#ffffff';
}
