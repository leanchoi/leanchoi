"use client";

import { useMemo, useState } from "react";
import { Button, Field, inputCls } from "@/components/ui";
import { formatMoney } from "@/lib/money";

type Slot = {
  id: string;
  startsAt: string; // ISO
  capacity: number;
  booked: number;
  priceCentsOverride: number | null;
};

type Props = {
  listingId: string;
  type: "ACTIVITY" | "PRODUCT";
  priceCents: number;
  currency: string;
  stock: number | null;
  slots: Slot[];
  channel: "MASTER" | "TENANT_SITE";
  themed?: boolean;
};

// Widget de compra/reserva: elegi fecha (si es actividad), cantidad y datos.
// Crea la orden y redirige al checkout de Mercado Pago del VENDEDOR.
export function BookingWidget({ listingId, type, priceCents, currency, stock, slots, channel, themed }: Props) {
  const [slotId, setSlotId] = useState<string>("");
  const [quantity, setQuantity] = useState(1);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string>("");

  const byDay = useMemo(() => {
    const groups = new Map<string, Slot[]>();
    for (const slot of slots) {
      const day = new Date(slot.startsAt).toLocaleDateString("es-AR", {
        weekday: "short",
        day: "numeric",
        month: "short",
      });
      if (!groups.has(day)) groups.set(day, []);
      groups.get(day)!.push(slot);
    }
    return [...groups.entries()];
  }, [slots]);

  const selected = slots.find((s) => s.id === slotId);
  const unitPrice = selected?.priceCentsOverride ?? priceCents;
  const total = unitPrice * quantity;
  const maxQty = type === "ACTIVITY" ? (selected ? selected.capacity - selected.booked : 10) : (stock ?? 10);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("loading");
    setError("");
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId,
          slotId: slotId || undefined,
          quantity,
          customerName: name,
          customerEmail: email,
          customerPhone: phone || undefined,
          channel,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No pudimos iniciar el pago");
      window.location.href = data.redirectUrl;
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "No pudimos iniciar el pago");
    }
  }

  const accentBtn = themed
    ? "!bg-site-primary !text-site-bg hover:!brightness-110"
    : undefined;

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {type === "ACTIVITY" && (
        <div>
          <p className="mb-2 text-sm font-medium">Elegí fecha y horario</p>
          {byDay.length === 0 && (
            <p className="rounded-lg bg-black/5 px-3 py-2.5 text-sm opacity-70">
              Sin fechas publicadas por ahora. Consultá por WhatsApp.
            </p>
          )}
          <div className="flex max-h-56 flex-col gap-3 overflow-y-auto pr-1 panel-scroll">
            {byDay.map(([day, daySlots]) => (
              <div key={day}>
                <p className="text-xs font-semibold uppercase tracking-wide opacity-60">{day}</p>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {daySlots.map((slot) => {
                    const left = slot.capacity - slot.booked;
                    const time = new Date(slot.startsAt).toLocaleTimeString("es-AR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    });
                    const active = slot.id === slotId;
                    return (
                      <button
                        key={slot.id}
                        type="button"
                        disabled={left <= 0}
                        onClick={() => {
                          setSlotId(slot.id);
                          setQuantity((q) => Math.min(q, left));
                        }}
                        className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors disabled:opacity-40 ${
                          active
                            ? themed
                              ? "border-site-primary bg-site-primary text-site-bg"
                              : "border-pine bg-pine text-bone"
                            : "border-black/15 hover:border-black/40"
                        }`}
                      >
                        {time}
                        <span className="ml-1.5 text-[11px] opacity-70">({left})</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Field label={type === "ACTIVITY" ? "Personas" : "Cantidad"}>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            className="h-9 w-9 rounded-full border border-black/15 text-lg leading-none hover:border-black/40"
            aria-label="Restar"
          >
            −
          </button>
          <span className="w-8 text-center font-display text-lg font-semibold">{quantity}</span>
          <button
            type="button"
            onClick={() => setQuantity((q) => Math.min(maxQty, q + 1))}
            className="h-9 w-9 rounded-full border border-black/15 text-lg leading-none hover:border-black/40"
            aria-label="Sumar"
          >
            +
          </button>
        </div>
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nombre y apellido">
          <input required minLength={2} value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="Ana Pérez" />
        </Field>
        <Field label="Email">
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputCls}
            placeholder="ana@mail.com"
          />
        </Field>
      </div>
      <Field label="WhatsApp (opcional)">
        <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} placeholder="+54 9 ..." />
      </Field>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700">{error}</p>}

      <div className="flex items-center justify-between border-t border-black/10 pt-4">
        <div>
          <p className="text-xs opacity-60">Total</p>
          <p className="font-display text-2xl font-bold">{formatMoney(total, currency)}</p>
        </div>
        <Button
          type="submit"
          size="lg"
          className={accentBtn}
          disabled={state === "loading" || (type === "ACTIVITY" && !slotId)}
        >
          {state === "loading" ? "Redirigiendo…" : "Pagar con Mercado Pago"}
        </Button>
      </div>
      <p className="text-xs opacity-50">
        Pago procesado por Mercado Pago. El dinero va directo a la cuenta del operador.
      </p>
    </form>
  );
}
