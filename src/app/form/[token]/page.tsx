'use client'

import { useEffect, useState } from 'react'
import Logo from '@/components/Logo'
import Footer from '@/components/Footer'
import { FieldInput } from '@/components/table/cells'

export default function PublicFormPage({ params }: { params: { token: string } }) {
  const [form, setForm] = useState<any>(null)
  const [notFound, setNotFound] = useState(false)
  const [data, setData] = useState<any>({})
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    fetch(`/api/forms/${params.token}`)
      .then(async (r) => {
        if (!r.ok) {
          setNotFound(true)
          return
        }
        setForm(await r.json())
      })
      .catch(() => setNotFound(true))
  }, [params.token])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    for (const f of form.fields) {
      if (f.required) {
        const v = data[f.id]
        if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) {
          setError(`Completá el campo "${f.name}"`)
          return
        }
      }
    }
    setSending(true)
    const res = await fetch(`/api/forms/${params.token}`, {
      method: 'POST',
      body: JSON.stringify({ data }),
    })
    setSending(false)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setError(d.error || 'No se pudo enviar')
      return
    }
    setDone(true)
  }

  return (
    <div className="flex min-h-screen flex-col">
      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-10">
        <div className="mb-6 flex items-center gap-2">
          <Logo size={32} />
          <span className="font-semibold">
            Arrayán <span className="text-teal-400">Workflows</span>
          </span>
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
            <p className="mb-4 text-lg font-medium">¡Gracias! Tu respuesta fue enviada.</p>
            <button
              className="btn-ghost border border-slate-700"
              onClick={() => {
                setData({})
                setDone(false)
              }}
            >
              Enviar otra respuesta
            </button>
          </div>
        )}

        {form && !done && (
          <form onSubmit={submit} className="card p-6 sm:p-8">
            <h1 className="mb-1 text-2xl font-bold">{form.title}</h1>
            {form.description && <p className="mb-4 text-sm text-slate-400">{form.description}</p>}
            <div className="mt-5 space-y-5">
              {form.fields.map((f: any) => (
                <div key={f.id}>
                  <p className="mb-1 text-sm font-medium">
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
      <Footer />
    </div>
  )
}
