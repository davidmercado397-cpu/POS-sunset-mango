import { Checkbox } from './ui';

export interface ModuleInfo {
  key: string;
  label: string;
  description: string;
  core: boolean;
  dependsOn?: string[];
}

/** Lista de módulos con dependencias: activar Compras/Traslados exige Inventario. */
export function ModuleChecklist({ modules, value, onChange }: { modules: ModuleInfo[]; value: string[]; onChange: (v: string[]) => void }) {
  const toggle = (m: ModuleInfo, checked: boolean) => {
    let next = new Set(value);
    if (checked) {
      next.add(m.key);
      m.dependsOn?.forEach((d) => next.add(d));
    } else {
      next.delete(m.key);
      // Apagar un módulo apaga los que dependen de él.
      modules.filter((x) => x.dependsOn?.includes(m.key)).forEach((x) => next.delete(x.key));
    }
    next = new Set(modules.map((x) => x.key).filter((k) => next.has(k)));
    onChange([...next]);
  };
  return (
    <div className="grid gap-1 sm:grid-cols-2">
      {modules.map((m) => (
        <Checkbox
          key={m.key}
          label={m.label}
          description={m.core ? 'Siempre activo' : m.description}
          checked={m.core || value.includes(m.key)}
          disabled={m.core}
          onChange={(e) => toggle(m, e.target.checked)}
        />
      ))}
    </div>
  );
}
