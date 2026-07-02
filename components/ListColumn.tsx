'use client';
import { useState, useRef, useEffect } from 'react';
import { Droppable, Draggable } from '@hello-pangea/dnd';
import CardItem from './CardItem';
import { Plus, X, MoreHorizontal, Trash2, Edit2 } from 'lucide-react';

interface Label { id: number; color: string; text: string; }
interface Member { user_id: number; display_name: string; }
interface Card { id: number; list_id: number; title: string; description?: string; due_date?: string; position: number; cover_attachment_id?: number; labels: Label[]; members: Member[]; dimmed?: boolean; }
interface List { id: number; title: string; }

export default function ListColumn({ list, index, cards, onAddCard, onDeleteList, onRenameList, onCardClick }: {
  list: List; index: number; cards: Card[];
  onAddCard: (listId: number, title: string) => Promise<void>;
  onDeleteList: (listId: number) => Promise<void>;
  onRenameList: (listId: number, title: string) => Promise<void>;
  onCardClick: (cardId: number) => void;
}) {
  const [addingCard, setAddingCard] = useState(false);
  const [cardTitle, setCardTitle] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [listTitle, setListTitle] = useState(list.title);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  async function submitCard() {
    if (!cardTitle.trim()) return;
    await onAddCard(list.id, cardTitle.trim());
    setCardTitle(''); setAddingCard(false);
  }

  async function submitRename() {
    if (listTitle.trim() && listTitle !== list.title) await onRenameList(list.id, listTitle.trim());
    setEditing(false);
  }

  return (
    <Draggable draggableId={`list-${list.id}`} index={index}>
      {(provided) => (
        <div ref={provided.innerRef} {...provided.draggableProps} className="flex-shrink-0 w-72 bg-[#0b1220] rounded-xl flex flex-col max-h-[calc(100vh-130px)]">
          <div {...provided.dragHandleProps} className="flex items-center gap-2 px-3 py-2.5 cursor-grab">
            {editing ? (
              <input
                autoFocus
                value={listTitle}
                onChange={e => setListTitle(e.target.value)}
                onBlur={submitRename}
                onKeyDown={e => { if (e.key === 'Enter') submitRename(); if (e.key === 'Escape') { setListTitle(list.title); setEditing(false); } }}
                className="flex-1 bg-[#1e293b] text-white text-sm font-semibold rounded px-2 py-0.5 focus:outline-none border border-teal-400"
              />
            ) : (
              <h3 className="flex-1 text-sm font-semibold text-[#cbd5e1] truncate">{list.title}</h3>
            )}
            <span className="text-xs text-[#94a3b8]">{cards.length}</span>
            <div className="relative" ref={menuRef}>
              <button onClick={() => setMenuOpen(!menuOpen)} className="text-[#94a3b8] hover:text-white p-0.5 rounded hover:bg-white/10">
                <MoreHorizontal size={16} />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full mt-1 bg-[#243447] border border-[#3b5068] rounded-lg shadow-xl z-50 w-44 py-1">
                  <button onClick={() => { setEditing(true); setMenuOpen(false); }} className="w-full text-left px-3 py-2 text-sm text-[#cbd5e1] hover:bg-[#3b5068] flex items-center gap-2">
                    <Edit2 size={14} /> Renombrar
                  </button>
                  <button onClick={() => { onDeleteList(list.id); setMenuOpen(false); }} className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-[#3b5068] flex items-center gap-2">
                    <Trash2 size={14} /> Eliminar lista
                  </button>
                </div>
              )}
            </div>
          </div>

          <Droppable droppableId={`list-${list.id}`} type="CARD">
            {(provided, snapshot) => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                className={`flex-1 overflow-y-auto px-2 space-y-2 min-h-[4px] transition-colors ${snapshot.isDraggingOver ? 'bg-white/5 rounded-lg' : ''}`}
              >
                {cards.map((card, cardIndex) => (
                  <CardItem key={card.id} card={card} index={cardIndex} onClick={() => onCardClick(card.id)} />
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>

          <div className="px-2 pb-2 pt-1">
            {addingCard ? (
              <div className="space-y-2">
                <textarea
                  autoFocus
                  value={cardTitle}
                  onChange={e => setCardTitle(e.target.value)}
                  placeholder="Ingresá un título para la tarjeta..."
                  rows={3}
                  className="w-full bg-[#1e293b] text-white text-sm rounded-lg px-3 py-2 focus:outline-none border border-[#4a5568] resize-none"
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitCard(); } if (e.key === 'Escape') setAddingCard(false); }}
                />
                <div className="flex gap-2">
                  <button onClick={submitCard} className="bg-teal-600 hover:bg-teal-500 text-white text-sm px-3 py-1 rounded font-medium">Agregar</button>
                  <button onClick={() => { setAddingCard(false); setCardTitle(''); }} className="text-[#94a3b8] hover:text-white"><X size={18} /></button>
                </div>
              </div>
            ) : (
              <button onClick={() => setAddingCard(true)} className="w-full text-left px-2 py-1.5 text-[#94a3b8] hover:text-white hover:bg-white/10 rounded-lg text-sm flex items-center gap-1.5 transition-colors">
                <Plus size={16} /> Agregar tarjeta
              </button>
            )}
          </div>
        </div>
      )}
    </Draggable>
  );
}
