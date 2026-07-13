"use client";

import { useState } from "react";
import type { SiteBlock } from "@/lib/site-config";
import { inputCls, textareaCls } from "@/components/ui";

// Editor de bloques del sitio white-label: agregar, reordenar, editar y borrar.
// Serializa a JSON y lo envia por server action (input hidden).

const BLOCK_NAMES: Record<SiteBlock["type"], string> = {
  hero: "Portada (hero)",
  featured: "Grilla de publicaciones",
  story: "Historia / Quiénes somos",
  gallery: "Galería de fotos",
  testimonials: "Testimonios",
  stats: "Números destacados",
  faq: "Preguntas frecuentes",
  cta: "Llamado a la acción",
};

function newBlock(type: SiteBlock["type"]): SiteBlock {
  switch (type) {
    case "hero":
      return { type, title: "Tu título principal", subtitle: "Una frase que invite a reservar.", ctaLabel: "Reservar", layout: "split" };
    case "featured":
      return { type, title: "Nuestras experiencias", listingType: "ALL" };
    case "story":
      return { type, title: "Quiénes somos", body: "Contá tu historia.", imageSide: "right" };
    case "gallery":
      return { type, images: [] };
    case "testimonials":
      return { type, items: [{ quote: "Excelente experiencia.", name: "Cliente feliz" }] };
    case "stats":
      return { type, items: [{ value: "10", label: "años de experiencia" }] };
    case "faq":
      return { type, title: "Preguntas frecuentes", items: [{ q: "¿Pregunta?", a: "Respuesta." }] };
    case "cta":
      return { type, title: "¿Listo para reservar?", buttonLabel: "Reservar ahora" };
  }
}

export function BlocksEditor({
  initialBlocks,
  action,
}: {
  initialBlocks: SiteBlock[];
  action: (formData: FormData) => Promise<void>;
}) {
  const [blocks, setBlocks] = useState<SiteBlock[]>(initialBlocks);
  const [saved, setSaved] = useState(false);

  function update(index: number, patch: Partial<SiteBlock>) {
    setBlocks((prev) => prev.map((b, i) => (i === index ? ({ ...b, ...patch } as SiteBlock) : b)));
    setSaved(false);
  }
  function move(index: number, dir: -1 | 1) {
    setBlocks((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setSaved(false);
  }
  function remove(index: number) {
    setBlocks((prev) => prev.filter((_, i) => i !== index));
    setSaved(false);
  }

  return (
    <form
      action={async (fd) => {
        await action(fd);
        setSaved(true);
      }}
      className="flex flex-col gap-4"
    >
      <input type="hidden" name="blocks" value={JSON.stringify(blocks)} />

      <div className="flex flex-col gap-3">
        {blocks.map((block, i) => (
          <div key={i} className="rounded-card border border-ink/10 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-ink">{BLOCK_NAMES[block.type]}</p>
              <div className="flex items-center gap-2 text-xs">
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="rounded border border-ink/15 px-2 py-1 disabled:opacity-30" aria-label="Subir">↑</button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === blocks.length - 1} className="rounded border border-ink/15 px-2 py-1 disabled:opacity-30" aria-label="Bajar">↓</button>
                <button type="button" onClick={() => remove(i)} className="rounded border border-red-200 px-2 py-1 text-red-600" aria-label="Quitar">Quitar</button>
              </div>
            </div>
            <div className="mt-3">
              <BlockFields block={block} onChange={(patch) => update(i, patch)} />
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-ink/55">Agregar bloque:</span>
        {(Object.keys(BLOCK_NAMES) as SiteBlock["type"][]).map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => {
              setBlocks((prev) => [...prev, newBlock(type)]);
              setSaved(false);
            }}
            className="rounded-full border border-ink/15 px-3 py-1.5 text-xs font-medium text-ink/70 hover:border-pine hover:text-pine"
          >
            + {BLOCK_NAMES[type]}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" className="h-11 rounded-full bg-pine px-8 font-medium text-bone hover:bg-pine-deep">
          Guardar bloques
        </button>
        {saved && <span className="text-sm font-medium text-pine">Guardado ✓</span>}
      </div>
    </form>
  );
}

function BlockFields({ block, onChange }: { block: SiteBlock; onChange: (patch: any) => void }) {
  switch (block.type) {
    case "hero":
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <input className={inputCls} value={block.title} onChange={(e) => onChange({ title: e.target.value })} placeholder="Título" />
          <input className={inputCls} value={block.subtitle ?? ""} onChange={(e) => onChange({ subtitle: e.target.value })} placeholder="Subtítulo" />
          <input className={inputCls} value={block.image ?? ""} onChange={(e) => onChange({ image: e.target.value })} placeholder="URL de imagen de portada" />
          <div className="grid grid-cols-2 gap-3">
            <input className={inputCls} value={block.ctaLabel} onChange={(e) => onChange({ ctaLabel: e.target.value })} placeholder="Texto del botón" />
            <select className={inputCls} value={block.layout} onChange={(e) => onChange({ layout: e.target.value })}>
              <option value="split">Imagen al costado</option>
              <option value="full">Imagen de fondo completa</option>
            </select>
          </div>
        </div>
      );
    case "featured":
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <input className={inputCls} value={block.title} onChange={(e) => onChange({ title: e.target.value })} placeholder="Título de la sección" />
          <select className={inputCls} value={block.listingType} onChange={(e) => onChange({ listingType: e.target.value })}>
            <option value="ALL">Experiencias y productos</option>
            <option value="ACTIVITY">Solo experiencias</option>
            <option value="PRODUCT">Solo productos</option>
          </select>
        </div>
      );
    case "story":
      return (
        <div className="flex flex-col gap-3">
          <input className={inputCls} value={block.title} onChange={(e) => onChange({ title: e.target.value })} placeholder="Título" />
          <textarea className={textareaCls} rows={3} value={block.body} onChange={(e) => onChange({ body: e.target.value })} placeholder="Texto de la historia" />
          <div className="grid grid-cols-2 gap-3">
            <input className={inputCls} value={block.image ?? ""} onChange={(e) => onChange({ image: e.target.value })} placeholder="URL de imagen" />
            <select className={inputCls} value={block.imageSide} onChange={(e) => onChange({ imageSide: e.target.value })}>
              <option value="right">Imagen a la derecha</option>
              <option value="left">Imagen a la izquierda</option>
            </select>
          </div>
        </div>
      );
    case "gallery":
      return (
        <textarea
          className={textareaCls}
          rows={3}
          value={block.images.join("\n")}
          onChange={(e) => onChange({ images: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })}
          placeholder={"Una URL de imagen por línea"}
        />
      );
    case "testimonials":
      return (
        <EditableList
          items={block.items}
          onChange={(items) => onChange({ items })}
          fields={[
            { key: "quote", placeholder: "Cita" },
            { key: "name", placeholder: "Nombre" },
            { key: "origin", placeholder: "Ciudad (opcional)" },
          ]}
          newItem={{ quote: "", name: "", origin: "" }}
        />
      );
    case "stats":
      return (
        <EditableList
          items={block.items}
          onChange={(items) => onChange({ items })}
          fields={[
            { key: "value", placeholder: "Número (ej: 14 años)" },
            { key: "label", placeholder: "Etiqueta" },
          ]}
          newItem={{ value: "", label: "" }}
        />
      );
    case "faq":
      return (
        <div className="flex flex-col gap-3">
          <input className={inputCls} value={block.title} onChange={(e) => onChange({ title: e.target.value })} />
          <EditableList
            items={block.items}
            onChange={(items) => onChange({ items })}
            fields={[
              { key: "q", placeholder: "Pregunta" },
              { key: "a", placeholder: "Respuesta" },
            ]}
            newItem={{ q: "", a: "" }}
          />
        </div>
      );
    case "cta":
      return (
        <div className="grid gap-3 sm:grid-cols-3">
          <input className={inputCls} value={block.title} onChange={(e) => onChange({ title: e.target.value })} placeholder="Título" />
          <input className={inputCls} value={block.subtitle ?? ""} onChange={(e) => onChange({ subtitle: e.target.value })} placeholder="Subtítulo (opcional)" />
          <input className={inputCls} value={block.buttonLabel} onChange={(e) => onChange({ buttonLabel: e.target.value })} placeholder="Texto del botón" />
        </div>
      );
  }
}

function EditableList<T extends Record<string, any>>({
  items,
  onChange,
  fields,
  newItem,
}: {
  items: T[];
  onChange: (items: T[]) => void;
  fields: { key: keyof T & string; placeholder: string }[];
  newItem: T;
}) {
  return (
    <div className="flex flex-col gap-2">
      {items.map((item, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          {fields.map((field) => (
            <input
              key={field.key}
              className={`${inputCls} min-w-32 flex-1`}
              value={item[field.key] ?? ""}
              placeholder={field.placeholder}
              onChange={(e) => {
                const next = [...items];
                next[i] = { ...next[i], [field.key]: e.target.value };
                onChange(next);
              }}
            />
          ))}
          <button
            type="button"
            onClick={() => onChange(items.filter((_, j) => j !== i))}
            className="rounded border border-red-200 px-2 py-1 text-xs text-red-600"
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...items, newItem])}
        className="self-start rounded-full border border-ink/15 px-3 py-1 text-xs text-ink/70 hover:border-pine hover:text-pine"
      >
        + Agregar ítem
      </button>
    </div>
  );
}
