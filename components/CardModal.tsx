'use client';
import { useState, useEffect, useRef } from 'react';
import { X, Calendar, Tag, CheckSquare, MessageSquare, Trash2, Plus, Edit2, Users, Paperclip, Download, Image as ImageIcon, ListPlus } from 'lucide-react';
import LabelManager, { BoardLabel } from './LabelManager';

const MAX_FILE_SIZE = 50 * 1024 * 1024;

interface Label { id: number; color: string; text: string; }
interface Member { user_id: number; display_name: string; }
interface ChecklistItem { id: number; checklist_id: number; text: string; is_checked: number; due_date?: string; assigned_user_id?: number; assigned_user_name?: string; checklists?: Checklist[]; }
interface Checklist { id: number; card_id: number; title: string; parent_item_id?: number; items: ChecklistItem[]; }
interface Comment { id: number; user_id: number; text: string; created_at: string; author_name: string; }
interface Attachment { id: number; card_id: number; filename: string; size: number; mime?: string; created_at: string; }
interface Card { id: number; list_id: number; title: string; description?: string; due_date?: string; position: number; cover_attachment_id?: number; labels: Label[]; members: Member[]; }
interface FullCard extends Card { checklists: Checklist[]; comments: Comment[]; attachments: Attachment[]; }
interface User { id: number; display_name: string; username: string; }

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImage(att: Attachment): boolean {
  return (att.mime || '').startsWith('image/');
}

export default function CardModal({ card, listName, currentUserName, allUsers, boardId, boardLabels, onBoardLabelsChange, onBoardLabelUpdated, onBoardLabelDeleted, onClose, onDelete, onUpdate }: {
  card: Card; listName: string; currentUserName: string; allUsers: User[];
  boardId: number; boardLabels: BoardLabel[];
  onBoardLabelsChange: (labels: BoardLabel[]) => void;
  onBoardLabelUpdated: (oldLabel: BoardLabel, newLabel: BoardLabel) => void;
  onBoardLabelDeleted: (label: BoardLabel) => void;
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
  const [itemChecklistAdder, setItemChecklistAdder] = useState<number | null>(null);
  const [nestedTitle, setNestedTitle] = useState('');
  const [comment, setComment] = useState('');
  const [mentionFilter, setMentionFilter] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const commentRef = useRef<HTMLTextAreaElement>(null);

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

  // Light refresh (no full-modal spinner) used after checklist tree mutations
  async function refreshCard() {
    const res = await fetch(`/api/cards/${card.id}`);
    if (res.ok) setFull(await res.json());
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

  async function addLabel(color: string, text: string) {
    const res = await fetch(`/api/cards/${card.id}/labels`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ color, text }) });
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

  function toggleBoardLabel(label: BoardLabel, isOn: boolean) {
    if (isOn) {
      const existing = full?.labels.find(l => l.color === label.color);
      if (existing) removeLabel(existing.id);
    } else {
      addLabel(label.color, label.name);
    }
  }

  async function addChecklist() {
    if (!newChecklistTitle.trim()) return;
    await fetch(`/api/cards/${card.id}/checklists`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'add_checklist', title: newChecklistTitle }) });
    await refreshCard();
    setNewChecklistTitle(''); setShowChecklist(false);
  }

  async function addNestedChecklist(parentItemId: number) {
    if (!nestedTitle.trim()) return;
    await fetch(`/api/cards/${card.id}/checklists`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'add_checklist', title: nestedTitle, parent_item_id: parentItemId }) });
    await refreshCard();
    setNestedTitle(''); setItemChecklistAdder(null);
  }

  async function addItem(checklistId: number) {
    const text = newItems[checklistId];
    if (!text?.trim()) return;
    await fetch(`/api/cards/${card.id}/checklists`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'add_item', checklist_id: checklistId, text }) });
    await refreshCard();
    setNewItems(prev => ({ ...prev, [checklistId]: '' }));
  }

  async function toggleItem(itemId: number, checked: boolean) {
    await fetch(`/api/cards/${card.id}/checklists`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'toggle_item', item_id: itemId, is_checked: checked }) });
    await refreshCard();
  }

  async function updateItem(itemId: number, patch: { due_date?: string | null; assigned_user_id?: number | null }) {
    await fetch(`/api/cards/${card.id}/checklists`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'update_item', item_id: itemId, ...patch }) });
    await refreshCard();
    setItemUserPicker(null);
    setItemDatePicker(null);
  }

  async function deleteChecklist(checklistId: number) {
    await fetch(`/api/cards/${card.id}/checklists`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete_checklist', checklist_id: checklistId }) });
    await refreshCard();
  }

  async function deleteItem(itemId: number) {
    await fetch(`/api/cards/${card.id}/checklists`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete_item', item_id: itemId }) });
    await refreshCard();
  }

  function handleCommentChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const value = e.target.value;
    setComment(value);
    const caret = e.target.selectionStart ?? value.length;
    const before = value.slice(0, caret);
    const match = before.match(/@([a-zA-Z0-9_.-]*)$/);
    setMentionFilter(match ? match[1].toLowerCase() : null);
  }

  function pickMention(username: string) {
    const el = commentRef.current;
    const caret = el?.selectionStart ?? comment.length;
    const before = comment.slice(0, caret).replace(/@([a-zA-Z0-9_.-]*)$/, `@${username} `);
    setComment(before + comment.slice(caret));
    setMentionFilter(null);
    el?.focus();
  }

  const mentionMatches = mentionFilter !== null
    ? allUsers.filter(u => u.username.toLowerCase().startsWith(mentionFilter) || u.display_name.toLowerCase().startsWith(mentionFilter)).slice(0, 5)
    : [];

  function renderCommentText(text: string) {
    const parts = text.split(/(@[a-zA-Z0-9_.-]+)/g);
    return parts.map((part, i) => {
      if (part.startsWith('@') && allUsers.some(u => u.username === part.slice(1))) {
        return <span key={i} className="text-teal-300 font-medium bg-teal-500/10 rounded px-0.5">{part}</span>;
      }
      return <span key={i}>{part}</span>;
    });
  }

  async function addComment() {
    if (!comment.trim()) return;
    const res = await fetch(`/api/cards/${card.id}/comments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: comment }) });
    const c = await res.json();
    setFull(prev => prev ? { ...prev, comments: [...prev.comments, c] } : prev);
    setComment('');
    setMentionFilter(null);
  }

  async function deleteComment(commentId: number) {
    await fetch(`/api/cards/${card.id}/comments`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ commentId }) });
    setFull(prev => prev ? { ...prev, comments: prev.comments.filter(c => c.id !== commentId) } : prev);
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
      setFull(prev => {
        if (!prev) return prev;
        const cover = prev.cover_attachment_id || ((att.mime || '').startsWith('image/') ? att.id : prev.cover_attachment_id);
        return { ...prev, attachments: [att, ...(prev.attachments || [])], cover_attachment_id: cover };
      });
      if ((att.mime || '').startsWith('image/') && !full?.cover_attachment_id) {
        onUpdate({ ...card, cover_attachment_id: att.id });
      }
    } else {
      const err = await res.json().catch(() => ({}));
      setUploadError(err.error || 'Error al subir el archivo');
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function deleteAttachment(attachmentId: number) {
    await fetch(`/api/cards/${card.id}/attachments`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ attachmentId }) });
    setFull(prev => {
      if (!prev) return prev;
      const remaining = (prev.attachments || []).filter(a => a.id !== attachmentId);
      let cover = prev.cover_attachment_id;
      if (cover === attachmentId) {
        cover = remaining.find(a => isImage(a))?.id;
        onUpdate({ ...card, cover_attachment_id: cover });
      }
      return { ...prev, attachments: remaining, cover_attachment_id: cover };
    });
  }

  async function setCover(attachmentId: number | null) {
    await fetch(`/api/cards/${card.id}/attachments`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ attachmentId }) });
    setFull(prev => prev ? { ...prev, cover_attachment_id: attachmentId ?? undefined } : prev);
    onUpdate({ ...card, cover_attachment_id: attachmentId ?? undefined });
  }

  // Recursive checklist renderer: plain function (not a component) so inputs keep focus across re-renders
  function renderChecklist(cl: Checklist, depth: number): JSX.Element {
    const done = cl.items.filter(it => it.is_checked).length;
    const pct = cl.items.length ? Math.round((done / cl.items.length) * 100) : 0;
    return (
      <div key={cl.id} className={depth > 0 ? 'ml-6 mt-2 pl-3 border-l-2 border-[#3b5068]' : ''}>
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2"><CheckSquare size={depth > 0 ? 13 : 15} className="text-[#94a3b8]" /><h3 className={`text-[#cbd5e1] font-medium ${depth > 0 ? 'text-xs' : 'text-sm'}`}>{cl.title}</h3></div>
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
                <input type="checkbox" checked={!!item.is_checked} onChange={e => toggleItem(item.id, e.target.checked)} className="mt-0.5 accent-teal-500 cursor-pointer flex-shrink-0" />
                <span className={`flex-1 text-sm ${item.is_checked ? 'line-through text-[#94a3b8]' : 'text-[#cbd5e1]'}`}>{item.text}</span>

                {/* Item due date */}
                <div className="relative flex-shrink-0">
                  <button onClick={() => { setItemDatePicker(itemDatePicker === item.id ? null : item.id); setItemUserPicker(null); setItemChecklistAdder(null); }} className={`hover:text-white transition-opacity ${item.due_date ? 'text-[#94a3b8] opacity-100' : 'text-[#94a3b8] opacity-0 group-hover:opacity-100'}`} title="Asignar fecha">
                    <Calendar size={13} />
                  </button>
                  {itemDatePicker === item.id && (
                    <div className="absolute right-0 top-full mt-1 bg-[#243447] border border-[#3b5068] rounded-lg shadow-xl z-50 w-52 p-3">
                      <p className="text-[#94a3b8] text-xs font-semibold mb-2">Fecha límite del ítem</p>
                      <input type="date" defaultValue={item.due_date || ''} onChange={e => { if (e.target.value) updateItem(item.id, { due_date: e.target.value }); }}
                        className="w-full bg-[#0f172a] border border-[#3b5068] text-white text-sm rounded px-2 py-1.5 focus:outline-none focus:border-teal-400" />
                      {item.due_date && (
                        <button onClick={() => updateItem(item.id, { due_date: null })} className="w-full mt-2 text-red-400 hover:text-red-300 text-xs py-1 hover:bg-white/5 rounded">Quitar fecha</button>
                      )}
                    </div>
                  )}
                </div>

                {/* Item user picker */}
                <div className="relative flex-shrink-0">
                  <button onClick={() => { setItemUserPicker(itemUserPicker === item.id ? null : item.id); setItemDatePicker(null); setItemChecklistAdder(null); }} className={`hover:text-white transition-opacity ${item.assigned_user_id ? 'text-[#94a3b8] opacity-100' : 'text-[#94a3b8] opacity-0 group-hover:opacity-100'}`} title="Asignar responsable">
                    <Users size={13} />
                  </button>
                  {itemUserPicker === item.id && (
                    <div className="absolute right-0 top-full mt-1 bg-[#243447] border border-[#3b5068] rounded-lg shadow-xl z-50 w-44 py-1 max-h-48 overflow-y-auto">
                      <button onClick={() => updateItem(item.id, { assigned_user_id: null })} className="w-full text-left px-3 py-1.5 text-xs text-[#94a3b8] hover:bg-[#3b5068]">Sin responsable</button>
                      {allUsers.map(u => (
                        <button key={u.id} onClick={() => updateItem(item.id, { assigned_user_id: u.id })} className={`w-full text-left px-3 py-1.5 text-xs hover:bg-[#3b5068] ${item.assigned_user_id === u.id ? 'text-teal-300' : 'text-[#cbd5e1]'}`}>
                          {u.display_name}
                          {item.assigned_user_id === u.id ? ' ✓' : ''}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Nested checklist adder */}
                <div className="relative flex-shrink-0">
                  <button onClick={() => { setItemChecklistAdder(itemChecklistAdder === item.id ? null : item.id); setNestedTitle(''); setItemDatePicker(null); setItemUserPicker(null); }} className={`hover:text-white transition-opacity ${(item.checklists?.length || 0) > 0 ? 'text-[#94a3b8] opacity-100' : 'text-[#94a3b8] opacity-0 group-hover:opacity-100'}`} title="Agregar checklist anidado">
                    <ListPlus size={13} />
                  </button>
                  {itemChecklistAdder === item.id && (
                    <div className="absolute right-0 top-full mt-1 bg-[#243447] border border-[#3b5068] rounded-lg shadow-xl z-50 w-56 p-3">
                      <p className="text-[#94a3b8] text-xs font-semibold mb-2">Checklist anidado para este ítem</p>
                      <input autoFocus value={nestedTitle} onChange={e => setNestedTitle(e.target.value)} placeholder="Título..."
                        className="w-full bg-[#0f172a] text-white text-sm rounded px-2 py-1 focus:outline-none border border-[#3b5068] focus:border-teal-400 mb-2"
                        onKeyDown={e => { if (e.key === 'Enter') addNestedChecklist(item.id); if (e.key === 'Escape') setItemChecklistAdder(null); }} />
                      <button onClick={() => addNestedChecklist(item.id)} className="w-full bg-teal-600 hover:bg-teal-500 text-white text-sm py-1.5 rounded">Agregar</button>
                    </div>
                  )}
                </div>

                <button onClick={() => deleteItem(item.id)} className="text-[#94a3b8] hover:text-white opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"><X size={12} /></button>
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
              {/* Nested checklists */}
              {item.checklists?.map(sub => renderChecklist(sub, depth + 1))}
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
  }

  const coverAtt = full?.cover_attachment_id ? full.attachments?.find(a => a.id === full.cover_attachment_id) : null;

  const ACTION_BTN = 'flex items-center gap-1.5 px-3 py-1.5 bg-[#0f172a] hover:bg-[#2e415c] text-[#cbd5e1] hover:text-white text-xs rounded-lg transition-colors border border-[#3b5068]';

  return (
    <div className="fixed inset-0 bg-black/70 flex items-start justify-center z-50 p-4 overflow-y-auto" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-[#243447] rounded-xl w-full max-w-4xl my-8 relative shadow-2xl" onClick={e => e.stopPropagation()}>
        {loading ? (
          <div className="p-8 text-center text-[#94a3b8]">Cargando...</div>
        ) : (
          <>
            {/* Cover */}
            {coverAtt && (
              <div className="relative group/cover">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/attachments/${coverAtt.id}?inline=1`} alt="" className="w-full h-44 object-cover rounded-t-xl bg-black/30" />
                <button onClick={() => setCover(null)}
                  className="absolute bottom-2 right-2 text-xs bg-black/60 hover:bg-black/80 text-white px-2 py-1 rounded opacity-0 group-hover/cover:opacity-100 transition-opacity">
                  Quitar portada
                </button>
              </div>
            )}

            <div className="p-6 pb-5">
              {/* Title */}
              {editingTitle ? (
                <textarea autoFocus value={title} onChange={e => setTitle(e.target.value)} onBlur={saveTitle}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveTitle(); } }}
                  className="w-full bg-[#0f172a] text-white text-lg font-semibold rounded px-2 py-1 focus:outline-none resize-none border border-teal-400" rows={2} />
              ) : (
                <h2 className="text-white text-lg font-semibold cursor-pointer hover:bg-white/5 px-2 py-1 rounded -mx-2 pr-8" onClick={() => setEditingTitle(true)}>{title}</h2>
              )}
              <p className="text-[#94a3b8] text-xs mt-1 px-2 -mx-2">en la lista <span className="underline">{listName}</span></p>

              {/* Badges */}
              {(full?.labels?.length || full?.members?.length || dueDate) ? (
                <div className="flex flex-wrap items-center gap-2 mt-3">
                  {full?.labels?.map(l => (
                    <span key={l.id} onClick={() => setShowLabels(true)} className="h-6 min-w-[48px] rounded-full px-2 text-white text-xs flex items-center font-medium cursor-pointer hover:opacity-80" style={{ background: l.color }}>{l.text || ''}</span>
                  ))}
                  {full?.members?.map(m => (
                    <div key={m.user_id} title={m.display_name} className="w-7 h-7 rounded-full bg-teal-600 flex items-center justify-center text-white text-xs font-bold">{m.display_name.charAt(0).toUpperCase()}</div>
                  ))}
                  {dueDate && (
                    <button onClick={() => setShowDatePicker(true)} className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded ${new Date(dueDate) < new Date() ? 'bg-red-900/60 text-red-300' : 'bg-[#0f172a] text-[#cbd5e1]'}`}>
                      <Calendar size={12} /> Vence: {new Date(dueDate).toLocaleDateString('es')}
                    </button>
                  )}
                </div>
              ) : null}

              {/* Action chips */}
              <div className="flex flex-wrap gap-1.5 mt-4">
                <div className="relative">
                  <button onClick={() => { setShowMembers(!showMembers); setShowLabels(false); setShowDatePicker(false); setShowChecklist(false); }} className={ACTION_BTN}>
                    <Users size={13} /> Miembros
                  </button>
                  {showMembers && (
                    <div className="absolute left-0 top-full mt-1 bg-[#243447] border border-[#3b5068] rounded-xl shadow-2xl z-50 w-56 p-3 max-h-64 overflow-y-auto">
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

                <div className="relative">
                  <button onClick={() => { setShowLabels(!showLabels); setShowMembers(false); setShowDatePicker(false); setShowChecklist(false); }} className={ACTION_BTN}>
                    <Tag size={13} /> Etiquetas
                  </button>
                  {showLabels && (
                    <div className="absolute left-0 top-full mt-1 bg-[#243447] border border-[#3b5068] rounded-xl shadow-2xl z-50 w-72 p-3 max-h-80 overflow-y-auto">
                      <p className="text-[#94a3b8] text-xs font-semibold mb-2">Etiquetas del tablero</p>
                      <LabelManager
                        boardId={boardId}
                        labels={boardLabels}
                        onChange={onBoardLabelsChange}
                        onLabelUpdated={(o, n) => { onBoardLabelUpdated(o, n); refreshCard(); }}
                        onLabelDeleted={(l) => { onBoardLabelDeleted(l); refreshCard(); }}
                        cardLabelColors={(full?.labels || []).map(l => l.color)}
                        onToggleOnCard={toggleBoardLabel}
                      />
                    </div>
                  )}
                </div>

                <div className="relative">
                  <button onClick={() => { setShowDatePicker(!showDatePicker); setShowLabels(false); setShowMembers(false); setShowChecklist(false); }} className={ACTION_BTN}>
                    <Calendar size={13} /> Vencimiento
                  </button>
                  {showDatePicker && (
                    <div className="absolute left-0 top-full mt-1 bg-[#243447] border border-[#3b5068] rounded-xl shadow-2xl z-50 w-56 p-3">
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

                <div className="relative">
                  <button onClick={() => { setShowChecklist(!showChecklist); setShowLabels(false); setShowMembers(false); setShowDatePicker(false); }} className={ACTION_BTN}>
                    <CheckSquare size={13} /> Checklist
                  </button>
                  {showChecklist && (
                    <div className="absolute left-0 top-full mt-1 bg-[#243447] border border-[#3b5068] rounded-xl shadow-2xl z-50 w-56 p-3">
                      <p className="text-[#94a3b8] text-xs font-semibold mb-2">Agregar checklist</p>
                      <input autoFocus value={newChecklistTitle} onChange={e => setNewChecklistTitle(e.target.value)} placeholder="Título..."
                        className="w-full bg-[#0f172a] text-white text-sm rounded px-2 py-1 focus:outline-none border border-[#3b5068] focus:border-teal-400 mb-2"
                        onKeyDown={e => { if (e.key === 'Enter') addChecklist(); }} />
                      <button onClick={addChecklist} className="w-full bg-teal-600 hover:bg-teal-500 text-white text-sm py-1.5 rounded">Agregar</button>
                    </div>
                  )}
                </div>

                <div>
                  <input ref={fileInputRef} type="file" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f); }} />
                  <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className={`${ACTION_BTN} disabled:opacity-50`}>
                    <Paperclip size={13} /> {uploading ? 'Subiendo...' : 'Adjuntar'}
                  </button>
                </div>

                <button onClick={onDelete} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-900/30 hover:bg-red-900/60 text-red-400 hover:text-red-300 text-xs rounded-lg transition-colors border border-red-900/50 ml-auto">
                  <Trash2 size={13} /> Eliminar
                </button>
              </div>

              {/* Two-column layout */}
              <div className="flex flex-col md:flex-row gap-6 mt-5">
                {/* Main column */}
                <div className="flex-1 min-w-0 space-y-5">
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
                      <div onClick={() => setEditingDesc(true)} className="min-h-[60px] bg-[#0f172a] hover:bg-[#2e415c] text-sm text-[#cbd5e1] rounded-lg px-3 py-2 cursor-pointer transition-colors whitespace-pre-wrap">
                        {description || <span className="text-[#94a3b8]">Hacé clic para agregar una descripción...</span>}
                      </div>
                    )}
                  </div>

                  {/* Checklists (recursive: items can have nested checklists) */}
                  {full?.checklists.map(cl => renderChecklist(cl, 0))}

                  {/* Attachments */}
                  {((full?.attachments && full.attachments.length > 0) || uploading || uploadError) && (
                    <div>
                      <div className="flex items-center gap-2 mb-2"><Paperclip size={15} className="text-[#94a3b8]" /><h3 className="text-[#cbd5e1] font-medium text-sm">Adjuntos</h3></div>
                      {uploadError && <p className="text-red-400 text-xs mb-2">{uploadError}</p>}
                      {uploading && <p className="text-[#94a3b8] text-xs mb-2 animate-pulse">Subiendo archivo...</p>}
                      <div className="space-y-1.5">
                        {full?.attachments?.map(att => (
                          <div key={att.id} className="flex items-center gap-3 bg-[#0f172a] rounded-lg px-2.5 py-2 group">
                            {isImage(att) ? (
                              <a href={`/api/attachments/${att.id}?inline=1`} target="_blank" rel="noreferrer" className="flex-shrink-0">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={`/api/attachments/${att.id}?inline=1`} alt={att.filename} className="w-16 h-12 object-cover rounded bg-black/40 hover:opacity-80 transition-opacity" />
                              </a>
                            ) : (
                              <div className="w-16 h-12 rounded bg-[#1e293b] flex items-center justify-center flex-shrink-0">
                                <Paperclip size={16} className="text-[#94a3b8]" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-[#cbd5e1] text-sm truncate">{att.filename}</p>
                              <p className="text-[#94a3b8] text-xs">{formatSize(att.size)} · {new Date(att.created_at).toLocaleDateString('es')}</p>
                              {isImage(att) && (
                                full?.cover_attachment_id === att.id ? (
                                  <button onClick={() => setCover(null)} className="text-teal-300 hover:text-teal-200 text-xs flex items-center gap-1 mt-0.5"><ImageIcon size={10} /> Portada ✓ (quitar)</button>
                                ) : (
                                  <button onClick={() => setCover(att.id)} className="text-[#94a3b8] hover:text-white text-xs flex items-center gap-1 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity"><ImageIcon size={10} /> Hacer portada</button>
                                )
                              )}
                            </div>
                            <a href={`/api/attachments/${att.id}`} download className="text-[#94a3b8] hover:text-white p-1 rounded hover:bg-white/10 flex-shrink-0" title="Descargar"><Download size={14} /></a>
                            <button onClick={() => deleteAttachment(att.id)} className="text-[#94a3b8] hover:text-red-400 p-1 rounded hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" title="Eliminar"><X size={14} /></button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Comments column */}
                <div className="w-full md:w-72 flex-shrink-0">
                  <div className="flex items-center gap-2 mb-3"><MessageSquare size={15} className="text-[#94a3b8]" /><h3 className="text-[#cbd5e1] font-medium text-sm">Comentarios y actividad</h3></div>
                  <div className="relative mb-3">
                    <div className="flex gap-2">
                      <div className="w-7 h-7 rounded-full bg-teal-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">{currentUserName.charAt(0).toUpperCase()}</div>
                      <div className="flex-1 min-w-0">
                        <textarea ref={commentRef} value={comment} onChange={handleCommentChange} placeholder="Escribí un comentario... usá @ para mencionar" rows={2}
                          className="w-full bg-[#0f172a] text-white text-sm rounded-lg px-3 py-2 focus:outline-none resize-none border border-[#3b5068] focus:border-teal-400" />
                        {comment.trim() && <button onClick={addComment} className="mt-1 bg-teal-600 hover:bg-teal-500 text-white text-sm px-3 py-1 rounded">Guardar</button>}
                      </div>
                    </div>
                    {mentionFilter !== null && mentionMatches.length > 0 && (
                      <div className="absolute left-9 right-0 top-full -mt-1 bg-[#243447] border border-[#3b5068] rounded-lg shadow-2xl z-50 py-1">
                        {mentionMatches.map(u => (
                          <button key={u.id} onClick={() => pickMention(u.username)} className="w-full flex items-center gap-2 px-2.5 py-1.5 hover:bg-[#3b5068] text-left">
                            <div className="w-5 h-5 rounded-full bg-teal-600 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">{u.display_name.charAt(0).toUpperCase()}</div>
                            <span className="text-[#cbd5e1] text-xs">{u.display_name}</span>
                            <span className="text-[#94a3b8] text-xs ml-auto">@{u.username}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                    {full?.comments.slice().reverse().map(c => (
                      <div key={c.id} className="flex gap-2 group">
                        <div className="w-7 h-7 rounded-full bg-[#475569] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">{c.author_name.charAt(0).toUpperCase()}</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[#cbd5e1] text-xs font-medium">{c.author_name} <span className="text-[#94a3b8] font-normal">{new Date(c.created_at).toLocaleString('es')}</span></p>
                          <p className="text-[#cbd5e1] text-sm mt-0.5 break-words bg-[#0f172a] rounded-lg px-2.5 py-1.5">{renderCommentText(c.text)}</p>
                          <button onClick={() => deleteComment(c.id)} className="text-[#94a3b8] hover:text-red-400 text-xs mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">Eliminar</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
        <button onClick={onClose} className="absolute top-3 right-3 text-white bg-black/40 hover:bg-black/70 p-1.5 rounded-full transition-colors"><X size={18} /></button>
      </div>
    </div>
  );
}
