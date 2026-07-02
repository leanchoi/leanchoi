'use client';
import { useState, useEffect, useRef } from 'react';
import { X, Calendar, Tag, CheckSquare, MessageSquare, Trash2, Plus, Edit2, Users, Paperclip, Download } from 'lucide-react';

const LABEL_COLORS = ['#61bd4f','#f2d600','#ff9f1a','#eb5a46','#c377e0','#0079bf','#00c2e0','#51e898','#ff78cb','#344563'];
const MAX_FILE_SIZE = 50 * 1024 * 1024;

interface Label { id: number; color: string; text: string; }
interface Member { user_id: number; display_name: string; }
interface ChecklistItem { id: number; checklist_id: number; text: string; is_checked: number; due_date?: string; assigned_user_id?: number; assigned_user_name?: string; }
interface Checklist { id: number; card_id: number; title: string; items: ChecklistItem[]; }
interface Comment { id: number; user_id: number; text: string; created_at: string; author_name: string; }
interface Attachment { id: number; card_id: number; filename: string; size: number; mime?: string; created_at: string; }
interface Card { id: number; list_id: number; title: string; description?: string; due_date?: string; position: number; labels: Label[]; members: Member[]; }
interface FullCard extends Card { checklists: Checklist[]; comments: Comment[]; attachments: Attachment[]; }
interface User { id: number; display_name: string; username: string; }

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function CardModal({ card, listName, currentUserName, allUsers, onClose, onDelete, onUpdate }: {
  card: Card; listName: string; currentUserName: string; allUsers: User[];
  onClose: () => void; onDelete: () => void; onUpdate: (card: Card) => void;
}) {
  const [full, setFull] = useState<FullCard | null>(null);
  const [title, setTitle] = useState(card.title);
  const [editingTitle, setEditingTitle] = useState(false);
  const [description, setDescription] = useState(card.description || '');
  const [editingDesc, setEditingDesc] = useState(false);
  const [dueDate, setDueDate] = useState(card.due_date || '');
  const [showLabels, setShowLabels] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showChecklist, setShowChecklist] = useState(false);
  const [newChecklistTitle, setNewChecklistTitle] = useState('');
  const [newItems, setNewItems] = useState<Record<number, string>>({});
  const [itemUserPicker, setItemUserPicker] = useState<number | null>(null);
  const [itemDatePicker, setItemDatePicker] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    setShowDatePicker(false);
    await fetch(`/api/cards/${card.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ due_date: val || null }) });
    onUpdate({ ...card, due_date: val || undefined });
  }

  async function toggleMember(userId: number, has: boolean) {
    const method = has ? 'DELETE' : 'POST';
    await fetch(`/api/cards/${card.id}/members`, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }) });
    const newMembers = has
      ? (full?.members || []).filter(m => m.user_id !== userId)
      : [...(full?.members || []), { user_id: userId, display_name: allUsers.find(u => u.id === userId)?.display_name || '' }];
    setFull(prev => prev ? { ...prev, members: newMembers } : prev);
    onUpdate({ ...card, members: newMembers });
  }

  async function addLabel(color: string) {
    const res = await fetch(`/api/cards/${card.id}/labels`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ color }) });
    const label = await res.json();
    setFull(prev => prev ? { ...prev, labels: [...prev.labels, label] } : prev);
    onUpdate({ ...card, labels: [...(full?.labels || []), label] });
  }

  async function removeLabel(labelId: number) {
    await fetch(`/api/cards/${card.id}/labels`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ labelId }) });
    const newLabels = (full?.labels || []).filter(l => l.id !== labelId);
    setFull(prev => prev ? { ...prev, labels: newLabels } : prev);
    onUpdate({ ...card, labels: newLabels });
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

  async function updateItem(checklistId: number, itemId: number, patch: { due_date?: string | null; assigned_user_id?: number | null }) {
    const res = await fetch(`/api/cards/${card.id}/checklists`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'update_item', item_id: itemId, ...patch }) });
    const updated = await res.json();
    setFull(prev => prev ? { ...prev, checklists: prev.checklists.map(cl => cl.id === checklistId ? { ...cl, items: cl.items.map(it => it.id === itemId ? updated : it) } : cl) } : prev);
    setItemUserPicker(null);
    setItemDatePicker(null);
  }

  async function uploadFile(file: File) {
    setUploadError('');
    if (file.size > MAX_FILE_SIZE) { setUploadError(`"${file.name}" supera el límite de 50MB`); return; }
    setUploading(true);
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`/api/cards/${card.id}/attachments`, { method: 'POST', body: form });
    if (res.ok) {
      const att = await res.json();
      setFull(prev => prev ? { ...prev, attachments: [att, ...(prev.attachments || [])] } : prev);
    } else {
      const err = await res.json().catch(() => ({}));
      setUploadError(err.error || 'Error al subir el archivo');
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function deleteAttachment(attachmentId: number) {
    await fetch(`/api/cards/${card.id}/attachments`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ attachmentId }) });
    setFull(prev => prev ? { ...prev, attachments: (prev.attachments || []).filter(a => a.id !== attachmentId) } : prev);
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

  return (
    <div className="fixed inset-0 bg-black/70 flex items-start justify-center z-50 p-4 overflow-y-auto" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-[#243447] rounded-xl w-full max-w-2xl my-8 relative shadow-2xl" onClick={e => e.stopPropagation()}>
        {loading ? (
          <div className="p-8 text-center text-[#94a3b8]">Cargando...</div>
        ) : (
          <>
            <div className="p-6 pb-0">
              {editingTitle ? (
                <textarea autoFocus value={title} onChange={e => setTitle(e.target.value)} onBlur={saveTitle}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveTitle(); } }}
                  className="w-full bg-[#0f172a] text-white text-lg font-semibold rounded px-2 py-1 focus:outline-none resize-none border border-teal-400" rows={2} />
              ) : (
                <h2 className="text-white text-lg font-semibold cursor-pointer hover:bg-white/5 px-2 py-1 rounded -mx-2" onClick={() => setEditingTitle(true)}>{title}</h2>
              )}
              <p className="text-[#94a3b8] text-xs mt-1 px-2">en la lista <span className="underline">{listName}</span></p>

              {full?.labels && full.labels.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3 px-2">
                  {full.labels.map(l => (
                    <span key={l.id} onClick={() => setShowLabels(true)} className="h-6 min-w-[56px] rounded-full px-2 text-white text-xs flex items-center font-medium cursor-pointer hover:opacity-80" style={{ background: l.color }}>{l.text || ''}</span>
                  ))}
                </div>
              )}

              {full?.members && full.members.length > 0 && (
                <div className="flex items-center gap-1.5 mt-3 px-2">
                  <span className="text-[#94a3b8] text-xs">Responsables:</span>
                  {full.members.map(m => (
                    <div key={m.user_id} title={m.display_name} className="w-7 h-7 rounded-full bg-teal-600 flex items-center justify-center text-white text-xs font-bold">{m.display_name.charAt(0).toUpperCase()}</div>
                  ))}
                </div>
              )}

              {dueDate && (
                <div className="mt-3 px-2">
                  <button onClick={() => setShowDatePicker(true)} className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded ${new Date(dueDate) < new Date() ? 'bg-red-900/60 text-red-300' : 'bg-[#0f172a] text-[#cbd5e1]'}`}>
                    <Calendar size={12} /> Vence: {new Date(dueDate).toLocaleDateString('es')}
                  </button>
                </div>
              )}
            </div>

            <div className="flex gap-0 p-6 pt-4">
              <div className="flex-1 space-y-5 min-w-0">
                {/* Description */}
                <div>
                  <div className="flex items-center gap-2 mb-2"><Edit2 size={15} className="text-[#94a3b8]" /><h3 className="text-[#cbd5e1] font-medium text-sm">Descripción</h3></div>
                  {editingDesc ? (
                    <div className="space-y-2">
                      <textarea autoFocus value={description} onChange={e => setDescription(e.target.value)} rows={4}
                        className="w-full bg-[#0f172a] text-white text-sm rounded-lg px-3 py-2 focus:outline-none resize-none border border-teal-400" placeholder="Agregá una descripción..." />
                      <div className="flex gap-2">
                        <button onClick={saveDesc} className="bg-teal-600 hover:bg-teal-500 text-white text-sm px-3 py-1 rounded">Guardar</button>
                        <button onClick={() => { setEditingDesc(false); setDescription(full?.description || ''); }} className="text-[#94a3b8] hover:text-white text-sm px-2 py-1 rounded hover:bg-white/10">Cancelar</button>
                      </div>
                    </div>
                  ) : (
                    <div onClick={() => setEditingDesc(true)} className="min-h-[60px] bg-[#0f172a] hover:bg-[#2e415c] text-sm text-[#cbd5e1] rounded-lg px-3 py-2 cursor-pointer transition-colors">
                      {description || <span className="text-[#94a3b8]">Hacé clic para agregar una descripción...</span>}
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
                        <div className="flex items-center gap-2"><CheckSquare size={15} className="text-[#94a3b8]" /><h3 className="text-[#cbd5e1] font-medium text-sm">{cl.title}</h3></div>
                        <button onClick={() => deleteChecklist(cl.id)} className="text-[#94a3b8] hover:text-white text-xs px-2 py-0.5 rounded hover:bg-white/10">Eliminar</button>
                      </div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs text-[#94a3b8] w-7">{pct}%</span>
                        <div className="flex-1 h-1.5 bg-[#0f172a] rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-green-500' : 'bg-teal-500'}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                      <div className="space-y-1">
                        {cl.items.map(item => (
                          <div key={item.id} className="group">
                            <div className="flex items-start gap-2">
                              <input type="checkbox" checked={!!item.is_checked} onChange={e => toggleItem(cl.id, item.id, e.target.checked)} className="mt-0.5 accent-teal-500 cursor-pointer flex-shrink-0" />
                              <span className={`flex-1 text-sm ${item.is_checked ? 'line-through text-[#94a3b8]' : 'text-[#cbd5e1]'}`}>{item.text}</span>

                              {/* Item due date */}
                              <div className="relative flex-shrink-0">
                                <button onClick={() => { setItemDatePicker(itemDatePicker === item.id ? null : item.id); setItemUserPicker(null); }} className={`hover:text-white transition-opacity ${item.due_date ? 'text-[#94a3b8] opacity-100' : 'text-[#94a3b8] opacity-0 group-hover:opacity-100'}`} title="Asignar fecha">
                                  <Calendar size={13} />
                                </button>
                                {itemDatePicker === item.id && (
                                  <div className="absolute right-0 top-full mt-1 bg-[#243447] border border-[#3b5068] rounded-lg shadow-xl z-50 w-52 p-3">
                                    <p className="text-[#94a3b8] text-xs font-semibold mb-2">Fecha límite del ítem</p>
                                    <input type="date" defaultValue={item.due_date || ''} onChange={e => { if (e.target.value) updateItem(cl.id, item.id, { due_date: e.target.value }); }}
                                      className="w-full bg-[#0f172a] border border-[#3b5068] text-white text-sm rounded px-2 py-1.5 focus:outline-none focus:border-teal-400" />
                                    {item.due_date && (
                                      <button onClick={() => updateItem(cl.id, item.id, { due_date: null })} className="w-full mt-2 text-red-400 hover:text-red-300 text-xs py-1 hover:bg-white/5 rounded">Quitar fecha</button>
                                    )}
                                  </div>
                                )}
                              </div>

                              {/* Item user picker */}
                              <div className="relative flex-shrink-0">
                                <button onClick={() => { setItemUserPicker(itemUserPicker === item.id ? null : item.id); setItemDatePicker(null); }} className={`hover:text-white transition-opacity ${item.assigned_user_id ? 'text-[#94a3b8] opacity-100' : 'text-[#94a3b8] opacity-0 group-hover:opacity-100'}`} title="Asignar responsable">
                                  <Users size={13} />
                                </button>
                                {itemUserPicker === item.id && (
                                  <div className="absolute right-0 top-full mt-1 bg-[#243447] border border-[#3b5068] rounded-lg shadow-xl z-50 w-44 py-1 max-h-48 overflow-y-auto">
                                    <button onClick={() => updateItem(cl.id, item.id, { assigned_user_id: null })} className="w-full text-left px-3 py-1.5 text-xs text-[#94a3b8] hover:bg-[#3b5068]">Sin responsable</button>
                                    {allUsers.map(u => (
                                      <button key={u.id} onClick={() => updateItem(cl.id, item.id, { assigned_user_id: u.id })} className={`w-full text-left px-3 py-1.5 text-xs hover:bg-[#3b5068] ${item.assigned_user_id === u.id ? 'text-teal-300' : 'text-[#cbd5e1]'}`}>
                                        {u.display_name}
                                        {item.assigned_user_id === u.id ? ' ✓' : ''}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>

                              <button onClick={() => deleteItem(cl.id, item.id)} className="text-[#94a3b8] hover:text-white opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"><X size={12} /></button>
                            </div>
                            {/* Item badges */}
                            {(item.due_date || item.assigned_user_name) && (
                              <div className="flex gap-1.5 ml-6 mt-0.5">
                                {item.due_date && (
                                  <span className={`text-xs px-1.5 py-0.5 rounded flex items-center gap-1 ${new Date(item.due_date) < new Date() ? 'bg-red-900/50 text-red-300' : 'bg-[#0f172a] text-[#94a3b8]'}`}>
                                    <Calendar size={10} />{new Date(item.due_date).toLocaleDateString('es')}
                                  </span>
                                )}
                                {item.assigned_user_name && (
                                  <span className="text-xs px-1.5 py-0.5 rounded bg-[#0f172a] text-[#94a3b8] flex items-center gap-1">
                                    <Users size={10} />{item.assigned_user_name}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                        <div className="flex gap-2 mt-2">
                          <input value={newItems[cl.id] || ''} onChange={e => setNewItems(prev => ({ ...prev, [cl.id]: e.target.value }))}
                            placeholder="Agregar ítem..." className="flex-1 bg-[#0f172a] text-white text-sm rounded px-2 py-1 focus:outline-none border border-[#3b5068] focus:border-teal-400"
                            onKeyDown={e => { if (e.key === 'Enter') addItem(cl.id); }} />
                          <button onClick={() => addItem(cl.id)} className="text-[#94a3b8] hover:text-white p-1 rounded hover:bg-white/10"><Plus size={16} /></button>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Attachments */}
                {((full?.attachments && full.attachments.length > 0) || uploading || uploadError) && (
                  <div>
                    <div className="flex items-center gap-2 mb-2"><Paperclip size={15} className="text-[#94a3b8]" /><h3 className="text-[#cbd5e1] font-medium text-sm">Adjuntos</h3></div>
                    {uploadError && <p className="text-red-400 text-xs mb-2">{uploadError}</p>}
                    {uploading && <p className="text-[#94a3b8] text-xs mb-2 animate-pulse">Subiendo archivo...</p>}
                    <div className="space-y-1.5">
                      {full?.attachments?.map(att => (
                        <div key={att.id} className="flex items-center gap-2 bg-[#0f172a] rounded-lg px-3 py-2 group">
                          <Paperclip size={13} className="text-[#94a3b8] flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-[#cbd5e1] text-sm truncate">{att.filename}</p>
                            <p className="text-[#94a3b8] text-xs">{formatSize(att.size)} · {new Date(att.created_at).toLocaleDateString('es')}</p>
                          </div>
                          <a href={`/api/attachments/${att.id}`} download className="text-[#94a3b8] hover:text-white p-1 rounded hover:bg-white/10 flex-shrink-0" title="Descargar"><Download size={14} /></a>
                          <button onClick={() => deleteAttachment(att.id)} className="text-[#94a3b8] hover:text-red-400 p-1 rounded hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" title="Eliminar"><X size={14} /></button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Comments */}
                <div>
                  <div className="flex items-center gap-2 mb-3"><MessageSquare size={15} className="text-[#94a3b8]" /><h3 className="text-[#cbd5e1] font-medium text-sm">Comentarios</h3></div>
                  <div className="flex gap-2 mb-3">
                    <div className="w-7 h-7 rounded-full bg-teal-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">{currentUserName.charAt(0).toUpperCase()}</div>
                    <div className="flex-1">
                      <textarea value={comment} onChange={e => setComment(e.target.value)} placeholder="Escribí un comentario..." rows={2}
                        className="w-full bg-[#0f172a] text-white text-sm rounded-lg px-3 py-2 focus:outline-none resize-none border border-[#3b5068] focus:border-teal-400" />
                      {comment.trim() && <button onClick={addComment} className="mt-1 bg-teal-600 hover:bg-teal-500 text-white text-sm px-3 py-1 rounded">Guardar</button>}
                    </div>
                  </div>
                  {full?.comments.map(c => (
                    <div key={c.id} className="flex gap-2 mb-3 group">
                      <div className="w-7 h-7 rounded-full bg-[#475569] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">{c.author_name.charAt(0).toUpperCase()}</div>
                      <div className="flex-1">
                        <p className="text-[#cbd5e1] text-xs font-medium">{c.author_name} <span className="text-[#94a3b8] font-normal">{new Date(c.created_at).toLocaleString('es')}</span></p>
                        <p className="text-[#cbd5e1] text-sm mt-0.5">{c.text}</p>
                        <button onClick={() => deleteComment(c.id)} className="text-[#94a3b8] hover:text-red-400 text-xs mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">Eliminar</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Sidebar */}
              <div className="w-36 flex-shrink-0 pl-4 space-y-1.5">
                <p className="text-[#94a3b8] text-xs font-semibold uppercase mb-2">Acciones</p>

                {/* Members */}
                <div className="relative">
                  <button onClick={() => { setShowMembers(!showMembers); setShowLabels(false); setShowDatePicker(false); setShowChecklist(false); }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 bg-[#0f172a] hover:bg-[#2e415c] text-[#cbd5e1] hover:text-white text-xs rounded-lg transition-colors">
                    <Users size={13} /> Miembros
                  </button>
                  {showMembers && (
                    <div className="absolute right-0 top-full mt-1 bg-[#243447] border border-[#3b5068] rounded-xl shadow-2xl z-50 w-56 p-3 max-h-64 overflow-y-auto">
                      <p className="text-[#94a3b8] text-xs font-semibold mb-2">Asignar responsables</p>
                      {allUsers.map(u => {
                        const has = full?.members.some(m => m.user_id === u.id) || false;
                        return (
                          <button key={u.id} onClick={() => toggleMember(u.id, has)}
                            className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[#3b5068] text-sm text-left">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${has ? 'bg-teal-600' : 'bg-[#475569]'}`}>{u.display_name.charAt(0).toUpperCase()}</div>
                            <span className={has ? 'text-white' : 'text-[#cbd5e1]'}>{u.display_name}</span>
                            {has && <span className="ml-auto text-teal-300 text-xs">✓</span>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Labels */}
                <div className="relative">
                  <button onClick={() => { setShowLabels(!showLabels); setShowMembers(false); setShowDatePicker(false); setShowChecklist(false); }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 bg-[#0f172a] hover:bg-[#2e415c] text-[#cbd5e1] hover:text-white text-xs rounded-lg transition-colors">
                    <Tag size={13} /> Etiquetas
                  </button>
                  {showLabels && (
                    <div className="absolute right-0 top-full mt-1 bg-[#243447] border border-[#3b5068] rounded-xl shadow-2xl z-50 w-56 p-3">
                      <p className="text-[#94a3b8] text-xs font-semibold mb-2">Elegí un color</p>
                      <div className="grid grid-cols-5 gap-1.5">
                        {LABEL_COLORS.map(c => {
                          const existing = full?.labels.find(l => l.color === c);
                          return (
                            <button key={c} onClick={() => existing ? removeLabel(existing.id) : addLabel(c)} className="h-7 rounded relative" style={{ background: c }}>
                              {existing && <span className="absolute inset-0 flex items-center justify-center text-white text-xs">✓</span>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Due date */}
                <div className="relative">
                  <button onClick={() => { setShowDatePicker(!showDatePicker); setShowLabels(false); setShowMembers(false); setShowChecklist(false); }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 bg-[#0f172a] hover:bg-[#2e415c] text-[#cbd5e1] hover:text-white text-xs rounded-lg transition-colors">
                    <Calendar size={13} /> Vencimiento
                  </button>
                  {showDatePicker && (
                    <div className="absolute right-0 top-full mt-1 bg-[#243447] border border-[#3b5068] rounded-xl shadow-2xl z-50 w-56 p-3">
                      <p className="text-[#94a3b8] text-xs font-semibold mb-2">Fecha de vencimiento</p>
                      <input type="date" value={dueDate} onChange={e => saveDueDate(e.target.value)}
                        className="w-full bg-[#0f172a] border border-[#3b5068] text-white text-sm rounded px-2 py-1.5 focus:outline-none focus:border-teal-400" />
                      {dueDate && (
                        <button onClick={() => saveDueDate('')} className="w-full mt-2 text-red-400 hover:text-red-300 text-xs py-1 hover:bg-white/5 rounded">
                          Quitar fecha
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Checklist */}
                <div className="relative">
                  <button onClick={() => { setShowChecklist(!showChecklist); setShowLabels(false); setShowMembers(false); setShowDatePicker(false); }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 bg-[#0f172a] hover:bg-[#2e415c] text-[#cbd5e1] hover:text-white text-xs rounded-lg transition-colors">
                    <CheckSquare size={13} /> Checklist
                  </button>
                  {showChecklist && (
                    <div className="absolute right-0 top-full mt-1 bg-[#243447] border border-[#3b5068] rounded-xl shadow-2xl z-50 w-56 p-3">
                      <p className="text-[#94a3b8] text-xs font-semibold mb-2">Agregar checklist</p>
                      <input autoFocus value={newChecklistTitle} onChange={e => setNewChecklistTitle(e.target.value)} placeholder="Título..."
                        className="w-full bg-[#0f172a] text-white text-sm rounded px-2 py-1 focus:outline-none border border-[#3b5068] focus:border-teal-400 mb-2"
                        onKeyDown={e => { if (e.key === 'Enter') addChecklist(); }} />
                      <button onClick={addChecklist} className="w-full bg-teal-600 hover:bg-teal-500 text-white text-sm py-1.5 rounded">Agregar</button>
                    </div>
                  )}
                </div>

                {/* Attach file */}
                <div>
                  <input ref={fileInputRef} type="file" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f); }} />
                  <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
                    className="w-full flex items-center gap-2 px-3 py-1.5 bg-[#0f172a] hover:bg-[#2e415c] text-[#cbd5e1] hover:text-white text-xs rounded-lg transition-colors disabled:opacity-50">
                    <Paperclip size={13} /> {uploading ? 'Subiendo...' : 'Adjuntar'}
                  </button>
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
        <button onClick={onClose} className="absolute top-4 right-4 text-[#94a3b8] hover:text-white p-1 rounded hover:bg-white/10 transition-colors"><X size={20} /></button>
      </div>
    </div>
  );
}
