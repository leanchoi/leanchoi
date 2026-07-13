import { upsertListingAction } from "@/server/actions/listings";
import { Field, inputCls, textareaCls } from "@/components/ui";

type ListingData = {
  id?: string;
  title?: string;
  type?: "ACTIVITY" | "PRODUCT";
  category?: string;
  location?: string | null;
  shortDescription?: string | null;
  description?: string;
  priceCents?: number;
  durationMinutes?: number | null;
  capacityPerSlot?: number | null;
  stock?: number | null;
  images?: unknown;
  includes?: unknown;
  status?: string;
  tenantId?: string | null;
};

// Formulario de alta/edicion de listado, compartido entre panel tenant y master.
export function ListingForm({
  listing,
  tenants,
}: {
  listing?: ListingData;
  // solo lo recibe el master: para elegir a que cuenta pertenece
  tenants?: { id: string; name: string }[];
}) {
  const images = Array.isArray(listing?.images) ? (listing!.images as string[]).join("\n") : "";
  const includes = Array.isArray(listing?.includes) ? (listing!.includes as string[]).join("\n") : "";

  return (
    <form action={upsertListingAction} className="flex max-w-3xl flex-col gap-5">
      {listing?.id && <input type="hidden" name="id" value={listing.id} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tipo">
          <select name="type" defaultValue={listing?.type ?? "ACTIVITY"} className={inputCls}>
            <option value="ACTIVITY">Experiencia (con reserva por fecha)</option>
            <option value="PRODUCT">Producto (con stock y envío)</option>
          </select>
        </Field>
        {tenants && (
          <Field label="Pertenece a" hint="Vacío = inventario propio del master (100% para vos)">
            <select name="tenantId" defaultValue={listing?.tenantId ?? ""} className={inputCls}>
              <option value="">Inventario propio (master)</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </Field>
        )}
      </div>

      <Field label="Título">
        <input name="title" required minLength={3} defaultValue={listing?.title} className={inputCls} placeholder="Cabalgata al atardecer" />
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Categoría">
          <input name="category" defaultValue={listing?.category} className={inputCls} placeholder="Cabalgatas" />
        </Field>
        <Field label="Ubicación">
          <input name="location" defaultValue={listing?.location ?? ""} className={inputCls} placeholder="Tigre, Buenos Aires" />
        </Field>
        <Field label="Precio (ARS)">
          <input
            name="price"
            type="number"
            min={0}
            step="0.01"
            required
            defaultValue={listing?.priceCents ? listing.priceCents / 100 : undefined}
            className={inputCls}
            placeholder="45000"
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Duración (minutos)" hint="Solo experiencias">
          <input name="durationMinutes" type="number" min={0} defaultValue={listing?.durationMinutes ?? ""} className={inputCls} />
        </Field>
        <Field label="Cupo por horario" hint="Solo experiencias">
          <input name="capacityPerSlot" type="number" min={1} defaultValue={listing?.capacityPerSlot ?? 10} className={inputCls} />
        </Field>
        <Field label="Stock" hint="Solo productos">
          <input name="stock" type="number" min={0} defaultValue={listing?.stock ?? ""} className={inputCls} />
        </Field>
      </div>

      <Field label="Descripción corta" hint="Una línea para las tarjetas del catálogo">
        <input name="shortDescription" defaultValue={listing?.shortDescription ?? ""} className={inputCls} maxLength={140} />
      </Field>

      <Field label="Descripción completa" hint="Separá párrafos con una línea en blanco">
        <textarea name="description" required rows={7} defaultValue={listing?.description} className={textareaCls} />
      </Field>

      <Field label="Imágenes" hint="Una URL por línea. La primera es la principal.">
        <textarea name="images" rows={3} defaultValue={images} className={textareaCls} placeholder="https://..." />
      </Field>

      <Field label="Qué incluye" hint="Un ítem por línea">
        <textarea name="includes" rows={3} defaultValue={includes} className={textareaCls} placeholder={"Guía\nSeguro\nMerienda"} />
      </Field>

      <Field label="Estado">
        <select name="status" defaultValue={listing?.status === "PUBLISHED" ? "PUBLISHED" : "DRAFT"} className={inputCls}>
          <option value="DRAFT">Borrador (no visible)</option>
          <option value="PUBLISHED">Publicado</option>
        </select>
      </Field>

      <div>
        <button
          type="submit"
          className="h-11 rounded-full bg-pine px-8 font-medium text-bone transition-colors hover:bg-pine-deep"
        >
          Guardar
        </button>
      </div>
    </form>
  );
}
