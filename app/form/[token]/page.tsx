'use client';

import { useEffect, useState } from 'react';
import Logo from '@/components/Logo';
import { FieldInput } from '@/components/arrayan/cells';

export default function PublicFormPage({ params }: { params: { token: string } }) {
  const [form, setForm] = useState<any>(null);
  const [notFound, setNotFound] = useState(false);
  const [data, setData] = useState<any>({});
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch(`/api/forms/${params.token}`)
      .then(async (r) => {
        if (!r.ok) {
          setNotFound(true);
          return;
        }
        setForm(await r.json());
      })
      .catch(() => setNotFound(true));
  }, [params.token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    for (const f of form.fields) {
      if (f.required) {
        const v = data[f.id];
        if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) {
          setError(`Completá el campo "${f.name}"`);
          return;
        }
      }
    }
    setSending(true);
    const res = await fetch(`/api/forms/${params.token}`, {
      method: 'POST',
      body: JSON.stringify({ data }),
    });
    setSending(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error || 'No se pudo enviar');
      return;
    }
    setDone(true);
  }

  return (
    <div className="flex min-h-screen flex-col">
      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-10">
        <div className="mb-6 flex items-center gap-2.5 text-white">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#b9c8ea]/20 bg-gradient-to-br from-[#1d3461] to-[#101f3c] text-[#b9c8ea]">
            <Logo size={22} />
          </span>
          <span className="font-light tracking-[0.28em]">TROCHI</span>
        </div>

        {notFound && (
          <div className="card p-10 text-center text-slate-400">
            <p className="mb-2 text-3xl">🙁</p>
            <p>Este formulario no existe o fue desactivado.</p>
          </div>
        )}

        {form && done && (
          <div className="card p-10 text-center">
            <p className="mb-3 text-4xl">✅</p>
            <p className="mb-4 text-lg font-medium text-white">¡Gracias! Tu respuesta fue enviada.</p>
            <button
              className="btn-ghost border border-slate-700"
              onClick={() => {
                setData({});
                setDone(false);
              }}
            >
              Enviar otra respuesta
            </button>
          </div>
        )}

        {form && !done && (
          <form onSubmit={submit} className="card p-6 sm:p-8">
            <h1 className="mb-1 text-2xl font-bold text-white">{form.title}</h1>
            {form.description && <p className="mb-4 text-sm text-slate-400">{form.description}</p>}
            <div className="mt-5 space-y-5">
              {form.fields.map((f: any) => (
                <div key={f.id}>
                  <p className="mb-1 text-sm font-medium text-slate-200">
                    {f.name} {f.required && <span className="text-red-400">*</span>}
                  </p>
                  {f.help && <p className="mb-1 text-xs text-slate-500">{f.help}</p>}
                  <FieldInput
                    field={f}
                    value={data[f.id]}
                    onChange={(v) => setData({ ...data, [f.id]: v })}
                    ctx={{ users: [], linkedNames: {} }}
                  />
                </div>
              ))}
            </div>
            {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
            <button type="submit" disabled={sending} className="btn-primary mt-6 w-full">
              {sending ? 'Enviando…' : 'Enviar'}
            </button>
          </form>
        )}
      </main>
    </div>
  );
}
