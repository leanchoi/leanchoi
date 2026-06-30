'use client';
import { useState, useEffect, useRef } from 'react';
import { X, Calendar, Tag, CheckSquare, MessageSquare, Trash2, Plus, Edit2 } from 'lucide-react';

const LABEL_COLORS = ['#61bd4f','#f2d600','#ff9f1a','#eb5a46','#c377e0','#0079bf','#00c2e0','#51e898','#ff78cb','#344563'];

interface Label { id: number; color: string; text: string; }
interface ChecklistItem { id: number; checklist_id: number; text: string; is_checked: number; }
interface Checklist { id: number; card_id: number; title: string; items: ChecklistItem[]; }
interface Comment { id: number; user_id: number; text: string; created_at: string; author_name: string; }
interface Card { id: number; list_id: number; title: string; description?: string; due_date?: string; position: number; labels: Label[]; }
interface FullCard extends Card { checklists: Checklist[]; comments: Comment[]; }

export default function CardModal({ card, listName, currentUserName, onClose, onDelete, onUpdate }: {
  card: Card; listName: string; currentUserName: string;
  onClose: () => void; onDelete: () => void; onUpdate: (card: Card) => void;
}) {
  const [full, setFull] = useState<FullCard | null>(null);
  const [title, setTitle] = useState(card.title);
  const [editingTitle, setEditingTitle] = useState(false);
  const [description, setDescription] = useState(card.description || '');
  const [editingDesc, setEditingDesc] = useState(false);
  const [dueDate, setDueDate] = useState(card.due_date || '');
  const [showLabels, setShowLabels] = useState(false);
  const [showChecklist, setShowChecklist] = useState(false);
  const [newChecklistTitle, setNewChecklistTitle] = useState('');
  const [newItems, setNewItems] = useState<Record<number, string>>({});
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(true);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchCard();
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [card.id]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function fetchCard() {
    setLoading(true);
    const res = await fetch(`/api/cards/${card.id}`);
    const data = await res.json();
    setFull(data);
    setTitle(data.title);
    setDescription(data.description || '');
    setDueDate(data.due_date || '');
    setLoading(false);
  }

  async function saveTitle() {
    if (!title.trim() || title === card.title) { setEditingTitle(false); return; }
    await fetch(`/api/cards/${card.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) });
    onUpdate({ ...card, title });
    setEditingTitle(false);
  }

  async function saveDesc() {
    await fetch(`/api/cards/${card.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ description }) });
    onUpdate({ ...card, description });
    setEditingDesc(false);
  }

  async function saveDueDate(val: string) {
    setDueDate(val);
    await fetch(`/api/cards/${card.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ due_date: val || null }) });
    onUpdate({ ...card, due_date: val || undefined });
  }

  async function addLabel(color: string) {
    const res = await fetch(`/api/cards/${card.id}/labels`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ color }) });
    const label = await res.json();
    setFull(prev => prev ? { ...prev, labels: [...prev.labels, label] } : prev);
    onUpdate({ ...card, labels: [...(full?.labels || []), label] });
  }

  async function removeLabel(labelId: number) {
    await fetch(`/api/cards/${card.id}/labels`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ labelId }) });
    setFull(prev => prev ? { ...prev, labels: prev.labels.filter(l => l.id !== labelId) } : prev);
    onUpdate({ ...card, labels: (full?.labels || []).filter(l => l.id !== labelId) });
  }

  async function addChecklist() {
    if (!newChecklistTitle.trim()) return;
    const res = await fetch(`/api/cards/${card.id}/checklists`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'add_checklist', title: newChecklistTitle }) });
    const cl = await res.json();
    setFull(prev => prev ? { ...prev, checklists: [...prev.checklists, { ...cl, items: [] }] } : prev);
    setNewChecklistTitle(''); setShowChecklist(false);
  }

  async function addItem(checklistId: number) {
    const text = newItems[checklistId];
    if (!text?.trim()) return;
    const res = await fetch(`/api/cards/${card.id}/checklists`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'add_item', checklist_id: checklistId, text }) });
    const item = await res.json();
    setFull(prev => prev ? { ...prev, checklists: prev.checklists.map(cl => cl.id === checklistId ? { ...cl, items: [...cl.items, item] } : cl) } : prev);
    setNewItems(prev => ({ ...prev, [checklistId]: '' }));
  }

  async function toggleItem(checklistId: number, itemId: number, checked: boolean) {
    await fetch(`/api/cards/${card.id}/checklists`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'toggle_item', item_id: itemId, is_checked: checked }) });
    setFull(prev => prev ? { ...prev, checklists: prev.checklists.map(cl => cl.id === checklistId ? { ...cl, items: cl.items.map(it => it.id === itemId ? { ...it, is_checked: checked ? 1 : 0 } : it) } : cl) } : prev);
  }

  async function deleteChecklist(checklistId: number) {
    await fetch(`/api/cards/${card.id}/checklists`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete_checklist', checklist_id: checklistId }) });
    setFull(prev => prev ? { ...prev, checklists: prev.checklists.filter(cl => cl.id !== checklistId) } : prev);
  }

  async function deleteItem(checklistId: number, itemId: number) {
    await fetch(`/api/cards/${card.id}/checklists`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete_item', item_id: itemId }) });
    setFull(prev => prev ? { ...prev, checklists: prev.checklists.map(cl => cl.id === checklistId ? { ...cl, items: cl.items.filter(it => it.id !== itemId) } : cl) } : prev);
  }

  async function addComment() {
    if (!comment.trim()) return;
    const res = await fetch(`/api/cards/${card.id}/comments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: comment }) });
    const c = await res.json();
    setFull(prev => prev ? { ...prev, comments: [...prev.comments, c] } : prev);
    setComment('');
  }

  async function deleteComment(commentId: number) {
    await fetch(`/api/cards/${card.id}/comments`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ commentId }) });
    setFull(prev => prev ? { ...prev, comments: prev.comments.filter(c => c.id !== commentId) } : prev);
  }

  const totalItems = full?.checklists.reduce((a, cl) => a + cl.items.length, 0) || 0;
  const checkedItems = full?.checklists.reduce((a, cl) => a + cl.items.filter(it => it.is_checked).length, 0) || 0;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-start justify-center z-50 p-4 overflow-y-auto" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={modalRef} className="bg-[#282e33] rounded-xl w-full max-w-2xl my-8 relative shadow-2xl" onClick={e => e.stopPropagation()}>
        {loading ? (
          <div className="p-8 text-center text-[#8c9bab]">Cargando...</div>
        ) : (
          <>
            <div className="p-6 pb-0">
              {/* Title */}
              {editingTitle ? (
                <textarea
                  autoFocus
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  onBlur={saveTitle}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveTitle(); } }}
                  className="w-full bg-[#1d2125] text-white text-lg font-semibold rounded px-2 py-1 focus:outline-none resize-none border border-blue-500"
                  rows={2}
                />
              ) : (
                <h2 className="text-white text-lg font-semibold cursor-pointer hover:bg-white/5 px-2 py-1 rounded -mx-2" onClick={() => setEditingTitle(true)}>
                  {title}
                </h2>
              )}
              <p className="text-[#8c9bab] text-xs mt-1 px-2">en la lista <span className="underline">{listName}</span></p>

              {/* Labels preview */}
              {full?.labels && full.labels.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3 px-2">
                  {full.labels.map(l => (
                    <span key={l.id} onClick={() => setShowLabels(true)} className="h-6 min-w-[56px] rounded-full px-2 text-white text-xs flex items-center font-medium cursor-pointer hover:opacity-80" style={{ background: l.color }}>
                      {l.text || ''}
                    </span>
                  ))}
                </div>
              )}

              {/* Due date badge */}
              {dueDate && (
                <div className="mt-3 px-2">
                  <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded ${new Date(dueDate) < new Date() ? 'bg-red-900/60 text-red-300' : 'bg-[#1d2125] text-[#b6c2cf]'}`}>
                    <Calendar size={12} /> Vence: {new Date(dueDate).toLocaleDateString('es')}
                  </span>
                </div>
              )}
            </div>

            <div className="flex gap-0 p-6 pt-4">
              {/* Main content */}
              <div className="flex-1 space-y-5 min-w-0">
                {/* Description */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Edit2 size={15} className="text-[#8c9bab]" />
                    <h3 className="text-[#b6c2cf] font-medium text-sm">Descripción</h3>
                  </div>
                  {editingDesc ? (
                    <div className="space-y-2">
                      <textarea
                        autoFocus
                        value={description}
                        onChange={e => setDescription(e.target.value)}
                        rows={4}
                        className="w-full bg-[#1d2125] text-white text-sm rounded-lg px-3 py-2 focus:outline-none resize-none border border-blue-500"
                        placeholder="Agregá una descripción más detallada..."
                      />
                      <div className="flex gap-2">
                        <button onClick={saveDesc} className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-3 py-1 rounded">Guardar</button>
                        <button onClick={() => { setEditingDesc(false); setDescription(full?.description || ''); }} className="text-[#8c9bab] hover:text-white text-sm px-2 py-1 rounded hover:bg-white/10">Cancelar</button>
                      </div>
                    </div>
                  ) : (
                    <div onClick={() => setEditingDesc(true)} className="min-h-[60px] bg-[#1d2125] hover:bg-[#2c3540] text-sm text-[#b6c2cf] rounded-lg px-3 py-2 cursor-pointer transition-colors">
                      {description || <span className="text-[#8c9bab]">Hacé clic para agregar una descripción...</span>}
                    </div>
                  )}
                </div>

                {/* Checklists */}
                {full?.checklists.map(cl => {
                  const done = cl.items.filter(it => it.is_checked).length;
                  const pct = cl.items.length ? Math.round((done / cl.items.length) * 100) : 0;
                  return (
                    <div key={cl.id}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <CheckSquare size={15} className="text-[#8c9bab]" />
                          <h3 className="text-[#b6c2cf] font-medium text-sm">{cl.title}</h3>
                        </div>
                        <button onClick={() => deleteChecklist(cl.id)} className="text-[#8c9bab] hover:text-white text-xs px-2 py-0.5 rounded hover:bg-white/10">Eliminar</button>
                      </div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs text-[#8c9bab] w-7">{pct}%</span>
                        <div className="flex-1 h-1.5 bg-[#1d2125] rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-green-500' : 'bg-blue-500'}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                      <div className="space-y-1">
                        {cl.items.map(item => (
                          <div key={item.id} className="flex items-start gap-2 group">
                            <input
                              type="checkbox"
                              checked={!!item.is_checked}
                              onChange={e => toggleItem(cl.id, item.id, e.target.checked)}
                              className="mt-0.5 accent-blue-500 cursor-pointer"
                            />
                            <span className={`flex-1 text-sm ${item.is_checked ? 'line-through text-[#8c9bab]' : 'text-[#b6c2cf]'}`}>{item.text}</span>
                            <button onClick={() => deleteItem(cl.id, item.id)} className="opacity-0 group-hover:opacity-100 text-[#8c9bab] hover:text-white transition-opacity">
                              <X size={12} />
                            </button>
                          </div>
                        ))}
                        <div className="flex gap-2 mt-2">
                          <input
                            value={newItems[cl.id] || ''}
                            onChange={e => setNewItems(prev => ({ ...prev, [cl.id]: e.target.value }))}
                            placeholder="Agregar ítem..."
                            className="flex-1 bg-[#1d2125] text-white text-sm rounded px-2 py-1 focus:outline-none border border-[#3d4b58] focus:border-blue-500"
                            onKeyDown={e => { if (e.key === 'Enter') addItem(cl.id); }}
                          />
                          <button onClick={() => addItem(cl.id)} className="text-[#8c9bab] hover:text-white p-1 rounded hover:bg-white/10"><Plus size={16} /></button>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Comments */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <MessageSquare size={15} className="text-[#8c9bab]" />
                    <h3 className="text-[#b6c2cf] font-medium text-sm">Comentarios</h3>
                  </div>
                  <div className="flex gap-2 mb-3">
                    <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                      {currentUserName.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <textarea
                        value={comment}
                        onChange={e => setComment(e.target.value)}
                        placeholder="Escribí un comentario..."
                        rows={2}
                        className="w-full bg-[#1d2125] text-white text-sm rounded-lg px-3 py-2 focus:outline-none resize-none border border-[#3d4b58] focus:border-blue-500"
                      />
                      {comment.trim() && (
                        <button onClick={addComment} className="mt-1 bg-blue-600 hover:bg-blue-700 text-white text-sm px-3 py-1 rounded">Guardar</button>
                      )}
                    </div>
                  </div>
                  {full?.comments.map(c => (
                    <div key={c.id} className="flex gap-2 mb-3 group">
                      <div className="w-7 h-7 rounded-full bg-[#44546f] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                        {c.author_name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1">
                        <p className="text-[#b6c2cf] text-xs font-medium">{c.author_name} <span className="text-[#8c9bab] font-normal">{new Date(c.created_at).toLocaleString('es')}</span></p>
                        <p className="text-[#b6c2cf] text-sm mt-0.5">{c.text}</p>
                        <button onClick={() => deleteComment(c.id)} className="text-[#8c9bab] hover:text-red-400 text-xs mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">Eliminar</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Sidebar actions */}
              <div className="w-36 flex-shrink-0 pl-4 space-y-1.5">
                <p className="text-[#8c9bab] text-xs font-semibold uppercase mb-2">Acciones</p>

                {/* Labels popover */}
                <div className="relative">
                  <button onClick={() => setShowLabels(!showLabels)} className="w-full flex items-center gap-2 px-3 py-1.5 bg-[#1d2125] hover:bg-[#2c3540] text-[#b6c2cf] hover:text-white text-xs rounded-lg transition-colors">
                    <Tag size={13} /> Etiquetas
                  </button>
                  {showLabels && (
                    <div className="absolute right-0 top-full mt-1 bg-[#282e33] border border-[#3d4b58] rounded-xl shadow-2xl z-50 w-56 p-3">
                      <p className="text-[#8c9bab] text-xs font-semibold mb-2">Elegí un color</p>
                      <div className="grid grid-cols-5 gap-1.5 mb-3">
                        {LABEL_COLORS.map(c => {
                          const existing = full?.labels.find(l => l.color === c);
                          return (
                            <button
                              key={c}
                              onClick={() => existing ? removeLabel(existing.id) : addLabel(c)}
                              className="h-7 rounded relative"
                              style={{ background: c }}
                            >
                              {existing && <span className="absolute inset-0 flex items-center justify-center text-white text-xs">✓</span>}
                            </button>
                          );
                        })}
                      </div>
                      <button onClick={() => setShowLabels(false)} className="w-full text-[#8c9bab] hover:text-white text-xs py-1 hover:bg-white/10 rounded">Cerrar</button>
                    </div>
                  )}
                </div>

                {/* Due date */}
                <div>
                  <label className="w-full flex items-center gap-2 px-3 py-1.5 bg-[#1d2125] hover:bg-[#2c3540] text-[#b6c2cf] hover:text-white text-xs rounded-lg transition-colors cursor-pointer">
                    <Calendar size={13} /> Vencimiento
                    <input type="date" value={dueDate} onChange={e => saveDueDate(e.target.value)} className="sr-only" />
                  </label>
                </div>

                {/* Add checklist */}
                <div className="relative">
                  <button onClick={() => setShowChecklist(!showChecklist)} className="w-full flex items-center gap-2 px-3 py-1.5 bg-[#1d2125] hover:bg-[#2c3540] text-[#b6c2cf] hover:text-white text-xs rounded-lg transition-colors">
                    <CheckSquare size={13} /> Checklist
                  </button>
                  {showChecklist && (
                    <div className="absolute right-0 top-full mt-1 bg-[#282e33] border border-[#3d4b58] rounded-xl shadow-2xl z-50 w-56 p-3">
                      <p className="text-[#8c9bab] text-xs font-semibold mb-2">Agregar checklist</p>
                      <input
                        autoFocus
                        value={newChecklistTitle}
                        onChange={e => setNewChecklistTitle(e.target.value)}
                        placeholder="Título..."
                        className="w-full bg-[#1d2125] text-white text-sm rounded px-2 py-1 focus:outline-none border border-[#3d4b58] focus:border-blue-500 mb-2"
                        onKeyDown={e => { if (e.key === 'Enter') addChecklist(); }}
                      />
                      <button onClick={addChecklist} className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm py-1.5 rounded">Agregar</button>
                    </div>
                  )}
                </div>

                <div className="pt-2 border-t border-white/10">
                  <button onClick={onDelete} className="w-full flex items-center gap-2 px-3 py-1.5 bg-red-900/30 hover:bg-red-900/60 text-red-400 hover:text-red-300 text-xs rounded-lg transition-colors">
                    <Trash2 size={13} /> Eliminar
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        <button onClick={onClose} className="absolute top-4 right-4 text-[#8c9bab] hover:text-white p-1 rounded hover:bg-white/10 transition-colors">
          <X size={20} />
        </button>
      </div>
    </div>
  );
}
