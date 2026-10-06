import clsx from 'clsx';
import { UtensilsCrossed } from 'lucide-react';

/** Foto del producto o un marcador con el color de su categoría. */
export function ProductImage({ src, alt, color, className }: { src: string | null; alt: string; color?: string; className?: string }) {
  if (src) return <img src={src} alt={alt} loading="lazy" className={clsx('object-cover', className)} />;
  return (
    <div className={clsx('flex items-center justify-center', className)} style={{ background: `${color ?? '#f97316'}22`, color: color ?? '#f97316' }}>
      <UtensilsCrossed className="size-1/3" />
    </div>
  );
}
