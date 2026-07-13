"use client";

import { useFormState, useFormStatus } from "react-dom";
import { loginAction } from "@/server/actions/auth";
import { Card, Field, inputCls } from "@/components/ui";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="h-11 w-full rounded-full bg-pine font-medium text-bone transition-colors hover:bg-pine-deep disabled:opacity-50"
    >
      {pending ? "Ingresando…" : "Ingresar"}
    </button>
  );
}

export default function LoginPage() {
  const [state, formAction] = useFormState(loginAction, null);

  return (
    <div className="mx-auto flex max-w-md flex-col px-5 py-20">
      <h1 className="text-center font-display text-3xl font-bold text-ink">Acceso al panel</h1>
      <p className="mt-2 text-center text-sm text-ink/60">
        Para operadores de la red y administración de Andar.
      </p>
      <Card className="mt-8 p-7">
        <form action={formAction} className="flex flex-col gap-4">
          <Field label="Email">
            <input name="email" type="email" required className={inputCls} placeholder="tu@email.com" autoComplete="email" />
          </Field>
          <Field label="Contraseña">
            <input name="password" type="password" required className={inputCls} placeholder="••••••••" autoComplete="current-password" />
          </Field>
          {state?.error && (
            <p className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700">{state.error}</p>
          )}
          <SubmitButton />
        </form>
      </Card>
      <p className="mt-6 text-center text-xs leading-relaxed text-ink/40">
        Demo: admin@andar.local (master) · pepito@andar.local (operador) · clave: andar2026
      </p>
    </div>
  );
}
