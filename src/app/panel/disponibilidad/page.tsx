import { requireTenant } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/panel/shell";
import { Card, EmptyState, Field, inputCls } from "@/components/ui";
import { generateSlotsAction, deleteSlotAction } from "@/server/actions/slots";

export const dynamic = "force-dynamic";

const WEEKDAYS = [
  { value: 1, label: "Lun" },
  { value: 2, label: "Mar" },
  { value: 3, label: "Mié" },
  { value: 4, label: "Jue" },
  { value: 5, label: "Vie" },
  { value: 6, label: "Sáb" },
  { value: 0, label: "Dom" },
];

export default async function DisponibilidadPage({
  searchParams,
}: {
  searchParams: { listado?: string };
}) {
  const session = await requireTenant();
  const activities = await db.listing.findMany({
    where: { tenantId: session.tenantId, type: "ACTIVITY" },
    orderBy: { title: "asc" },
  });

  if (activities.length === 0) {
    return (
      <>
        <PageHeader title="Disponibilidad" />
        <EmptyState
          title="Primero cargá una experiencia"
          body="La disponibilidad se define por experiencia: fechas, horarios y cupos."
        />
      </>
    );
  }

  const selected = activities.find((a) => a.id === searchParams.listado) ?? activities[0];
  const slots = await db.availabilitySlot.findMany({
    where: { listingId: selected.id, startsAt: { gte: new Date() } },
    orderBy: { startsAt: "asc" },
    take: 80,
  });

  const today = new Date().toISOString().slice(0, 10);
  const inMonth = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

  return (
    <>
      <PageHeader
        title="Disponibilidad"
        intro="Generá horarios en lote y pausá los que necesites. Los cupos se descuentan solos con cada venta."
      />

      <div className="flex flex-wrap gap-2">
        {activities.map((activity) => (
          <a
            key={activity.id}
            href={`/panel/disponibilidad?listado=${activity.id}`}
            className={`rounded-full border px-4 py-1.5 text-sm transition-colors ${
              activity.id === selected.id
                ? "border-pine bg-pine text-bone"
                : "border-ink/15 text-ink/70 hover:border-ink/40"
            }`}
          >
            {activity.title}
          </a>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <Card className="h-fit p-6">
          <h2 className="font-display text-lg font-semibold text-ink">Generar horarios</h2>
          <form action={generateSlotsAction} className="mt-4 flex flex-col gap-4">
            <input type="hidden" name="listingId" value={selected.id} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Desde">
                <input name="from" type="date" required defaultValue={today} className={inputCls} />
              </Field>
              <Field label="Hasta">
                <input name="to" type="date" required defaultValue={inMonth} className={inputCls} />
              </Field>
            </div>
            <Field label="Días de semana">
              <div className="flex flex-wrap gap-2">
                {WEEKDAYS.map((day) => (
                  <label key={day.value} className="flex cursor-pointer items-center gap-1.5 rounded-full border border-ink/15 px-3 py-1.5 text-sm has-[:checked]:border-pine has-[:checked]:bg-pine-mist">
                    <input type="checkbox" name="weekdays" value={day.value} defaultChecked={[5, 6].includes(day.value)} className="accent-pine" />
                    {day.label}
                  </label>
                ))}
              </div>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Hora de salida">
                <input name="time" type="time" required defaultValue="10:00" className={inputCls} />
              </Field>
              <Field label="Cupo">
                <input name="capacity" type="number" min={1} defaultValue={selected.capacityPerSlot ?? 10} className={inputCls} />
              </Field>
            </div>
            <button type="submit" className="h-11 rounded-full bg-pine font-medium text-bone hover:bg-pine-deep">
              Generar
            </button>
          </form>
        </Card>

        <Card className="p-6">
          <h2 className="font-display text-lg font-semibold text-ink">Próximos horarios</h2>
          {slots.length === 0 ? (
            <p className="mt-4 text-sm text-ink/50">No hay horarios futuros para esta experiencia.</p>
          ) : (
            <div className="mt-4 max-h-[480px] divide-y divide-ink/8 overflow-y-auto panel-scroll">
              {slots.map((slot) => {
                const left = slot.capacity - slot.booked;
                return (
                  <div key={slot.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <p className="text-ink">
                      {new Date(slot.startsAt).toLocaleDateString("es-AR", {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                    <div className="flex items-center gap-4">
                      <span className={`text-xs ${left === 0 ? "font-semibold text-amber-burnt" : "text-ink/55"}`}>
                        {left === 0 ? "Completo" : `${left} de ${slot.capacity} libres`}
                      </span>
                      {slot.booked === 0 && (
                        <form action={deleteSlotAction}>
                          <input type="hidden" name="id" value={slot.id} />
                          <button className="text-xs text-red-600/70 hover:text-red-700" type="submit">
                            Borrar
                          </button>
                        </form>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
