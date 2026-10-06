import { ImagePlus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { toast } from '../../components/toast';
import { Button, Card, Field, Input } from '../../components/ui';
import { api, upload } from '../../lib/api';
import { useApi, useApiMutation } from '../../lib/hooks';
import { applyBrand } from '../../lib/theme';

interface Branding { name: string; brandName: string; logoUrl: string | null; primaryColor: string; secondaryColor: string }

export function BrandingTab() {
  const { reload } = useAuth();
  const { data } = useApi<Branding>(['admin', 'branding'], '/admin/branding');
  const [form, setForm] = useState<Branding | null>(null);
  useEffect(() => { if (data) setForm(data); }, [data]);
  const after = { invalidate: [['admin', 'branding']] };
  const save = useApiMutation(() => api('/admin/branding', { method: 'PUT', json: { brandName: form!.brandName, primaryColor: form!.primaryColor, secondaryColor: form!.secondaryColor } }), { ...after, success: 'Marca actualizada' });
  const logo = useApiMutation((file: File) => upload('/admin/branding/logo', file), { ...after, success: 'Logo actualizado' });
  const removeLogo = useApiMutation(() => api('/admin/branding/logo', { method: 'DELETE' }), after);
  if (!form) return null;
  const done = { onSuccess: () => void reload() };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="space-y-4">
        <Field label="Nombre comercial"><Input value={form.brandName} onChange={(e) => setForm({ ...form, brandName: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-4">
          {(['primaryColor', 'secondaryColor'] as const).map((k) => (
            <Field key={k} label={k === 'primaryColor' ? 'Color principal' : 'Color secundario'}>
              <div className="flex items-center gap-2">
                <input type="color" value={form[k]} className="h-11 w-14 cursor-pointer rounded-lg border border-slate-300"
                  onChange={(e) => { const next = { ...form, [k]: e.target.value }; setForm(next); applyBrand(next.primaryColor, next.secondaryColor); }} />
                <Input value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
              </div>
            </Field>
          ))}
        </div>
        <div className="flex justify-end"><Button loading={save.isPending} onClick={() => save.mutate(undefined, done)}>Guardar</Button></div>
      </Card>
      <Card className="space-y-4">
        <p className="text-sm font-semibold">Logo</p>
        <div className="flex items-center gap-4">
          {form.logoUrl ? <img src={form.logoUrl} alt="Logo" className="size-24 rounded-2xl border object-cover" /> :
            <div className="flex size-24 items-center justify-center rounded-2xl border border-dashed text-xs text-slate-400">Sin logo</div>}
          <div className="flex flex-col gap-2">
            <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold hover:bg-slate-50">
              <ImagePlus className="size-4" /> {logo.isPending ? 'Subiendo…' : 'Subir imagen'}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) { if (f.size > 8e6) toast.error('La imagen supera 8 MB'); else logo.mutate(f, done); }
                e.target.value = '';
              }} />
            </label>
            {form.logoUrl && <Button variant="ghost" onClick={() => removeLogo.mutate(undefined, done)}><Trash2 className="size-4" /> Quitar</Button>}
          </div>
        </div>
        <div className="rounded-2xl p-4" style={{ background: form.primaryColor, color: '#fff' }}>
          <p className="text-sm opacity-80">Vista previa</p>
          <p className="text-lg font-bold">{form.brandName}</p>
        </div>
      </Card>
    </div>
  );
}
