import { Loader2 } from 'lucide-react';

export function FullScreenLoader() {
  return (
    <div className="flex h-full items-center justify-center">
      <Loader2 className="size-8 animate-spin text-brand" aria-label="Cargando" />
    </div>
  );
}
