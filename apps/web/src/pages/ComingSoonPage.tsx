import { Construction } from 'lucide-react';
import { Card } from '../components/ui';

export function ComingSoonPage({ title, phase }: { title: string; phase?: number }) {
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-4 text-2xl font-bold">{title}</h1>
      <Card className="flex flex-col items-center gap-3 py-12 text-center">
        <Construction className="size-10 text-brand" />
        <p className="font-semibold">Próximamente</p>
        <p className="text-sm text-slate-500">Este módulo se construye en la fase {phase ?? '—'} del plan.</p>
      </Card>
    </div>
  );
}
