'use client';
import { useState } from 'react';
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react';

export interface BoardLabel { id: number; board_id: number; name: string; color: string; }

export const LABEL_PALETTE = [
  '#4bce97', '#61bd4f', '#94c748', '#51e898', '#00c2e0', '#6cc3e0',
  '#579dff', '#0079bf', '#6e5dc6', '#9f8fef', '#c377e0', '#e774bb',
  '#ff78cb', '#cd5a91', '#f87462', '#eb5a46', '#ca3521', '#fea362',
  '#ff9f1a', '#faa53d', '#e2b203', '#f5cd47', '#8590a2', '#344563',
];

function LabelForm({ initialName, initialColor, submitLabel, onSubmit, onCancel }: {
  initialName: string; initialColor: string; submitLabel: string;
  onSubmit: (name: string, color: string) => void; onCancel: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState(initialColor);

  return (
    <div className="space-y-2 bg-surface-sunken rounded-lg p-2.5">
      <input
        autoFocus
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Nombre de la etiqueta..."
        className="w-full bg-surface-raised text-white text-xs rounded px-2 py-1.5 focus:outline-none border border-line focus:border-brand"
        onKeyDown={e => { if (e.key === 'Enter') onSubmit(name, color); if (e.key === 'Escape') onCancel(); }}
      />
      <div className="grid grid-cols-8 gap-1">
        {LABEL_PALETTE.map(c => (
          <button key={c} onClick={() => setColor(c)} className="h-5 rounded relative" style={{ background: c }}>
            {color === c && <Check size={11} className="absolute inset-0 m-auto text-white" />}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1.5 text-ink-lo text-xs cursor-pointer">
          <input type="color" value={color} onChange={e => setColor(e.target.value)} className="w-6 h-6 rounded cursor-pointer bg-transparent border border-line p-0.5" />
          Color propio
        </label>
        <span className="w-5 h-5 rounded-full ml-auto border border-white/20" style={{ background: color }} />
      </div>
      <div className="flex gap-2">
        <button onClick={() => onSubmit(name, color)} className="flex-1 bg-brand hover:bg-brand-hi text-white text-xs py-1.5 rounded font-medium">{submitLabel}</button>
        <button onClick={onCancel} className="text-ink-lo hover:text-white text-xs px-2">Cancelar</button>
      </div>
    </div>
  );
}

export default function LabelManager({ boardId, labels, onChange, onLabelUpdated, onLabelDeleted, cardLabelColors, onToggleOnCard }: {
  boardId: number;
  labels: BoardLabel[];
  onChange: (labels: BoardLabel[]) => void;
  onLabelUpdated?: (oldLabel: BoardLabel, newLabel: BoardLabel) => void;
  onLabelDeleted?: (label: BoardLabel) => void;
  cardLabelColors?: string[];
  onToggleOnCard?: (label: BoardLabel, isOn: boolean) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  async function createLabel(name: string, color: string) {
    const res = await fetch(`/api/boards/${boardId}/labels`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, color }) });
    if (res.ok) {
      const label = await res.json();
      onChange([...labels, label]);
    }
    setCreating(false);
  }

  async function updateLabel(label: BoardLabel, name: string, color: string) {
    const res = await fetch(`/api/boards/${boardId}/labels`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ labelId: label.id, name, color }) });
    if (res.ok) {
      const updated = await res.json();
      onChange(labels.map(l => l.id === label.id ? updated : l));
      onLabelUpdated?.(label, updated);
    }
    setEditingId(null);
  }

  async function deleteLabel(label: BoardLabel) {
    await fetch(`/api/boards/${boardId}/labels`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ labelId: label.id }) });
    onChange(labels.filter(l => l.id !== label.id));
    onLabelDeleted?.(label);
  }

  return (
    <div className="space-y-1.5">
      {labels.length === 0 && !creating && (
        <p className="text-ink-lo text-xs py-1">Todavía no hay etiquetas en este tablero.</p>
      )}

      {labels.map(label => {
        const isOn = cardLabelColors?.includes(label.color) || false;
        return editingId === label.id ? (
          <LabelForm key={label.id} initialName={label.name} initialColor={label.color} submitLabel="Guardar"
            onSubmit={(n, c) => updateLabel(label, n, c)} onCancel={() => setEditingId(null)} />
        ) : (
          <div key={label.id} className="flex items-center gap-1.5 group">
            <button
              onClick={() => onToggleOnCard?.(label, isOn)}
              disabled={!onToggleOnCard}
              className={`flex-1 h-7 rounded-md px-2.5 text-white text-xs font-medium text-left truncate transition-transform ${onToggleOnCard ? 'hover:opacity-85 cursor-pointer' : 'cursor-default'}`}
              style={{ background: label.color }}
            >
              {label.name || ' '}
              {isOn && <Check size={12} className="inline ml-1.5 -mt-0.5" />}
            </button>
            <button onClick={() => setEditingId(label.id)} className="text-ink-lo hover:text-white p-1 rounded hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" title="Editar"><Pencil size={12} /></button>
            <button onClick={() => deleteLabel(label)} className="text-ink-lo hover:text-red-400 p-1 rounded hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" title="Eliminar"><Trash2 size={12} /></button>
          </div>
        );
      })}

      {creating ? (
        <LabelForm initialName="" initialColor={LABEL_PALETTE[6]} submitLabel="Crear"
          onSubmit={createLabel} onCancel={() => setCreating(false)} />
      ) : (
        <button onClick={() => setCreating(true)} className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs text-ink-md hover:text-white bg-white/5 hover:bg-white/10 rounded-md transition-colors">
          <Plus size={13} /> Nueva etiqueta
        </button>
      )}
    </div>
  );
}
