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
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          data-list-col
          // 86vw deja asomar la lista siguiente, que es la pista de que hay más
          className="column flex max-h-[calc(100vh-13rem)] w-[86vw] max-w-[21rem] flex-shrink-0 snap-start flex-col sm:w-[17.5rem] md:max-h-[calc(100vh-9.5rem)]"
        >
          <div {...provided.dragHandleProps} className="flex cursor-grab items-center gap-2 px-3 py-2.5 active:cursor-grabbing">
            {editing ? (
              <input
                autoFocus
                value={listTitle}
                onChange={e => setListTitle(e.target.value)}
                onBlur={submitRename}
                onKeyDown={e => { if (e.key === 'Enter') submitRename(); if (e.key === 'Escape') { setListTitle(list.title); setEditing(false); } }}
                className="input flex-1 px-2 py-0.5 text-sm font-semibold"
                aria-label="Nombre de la lista"
              />
            ) : (
              <h3 className="flex-1 truncate text-[0.82rem] font-semibold tracking-tight text-ink-hi">{list.title}</h3>
            )}
            <span className="chip chip-neutral tnum" title={`${cards.length} tarjetas`}>{cards.length}</span>
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="btn-icon"
                aria-label={`Opciones de la lista ${list.title}`}
                aria-expanded={menuOpen}
              >
                <MoreHorizontal size={16} />
              </button>
              {menuOpen && (
                <div className="popover animate-pop absolute right-0 top-full z-50 mt-1.5 w-44 py-1">
                  <button
                    onClick={() => { setEditing(true); setMenuOpen(false); }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink-md transition-colors hover:bg-white/[0.06] hover:text-ink-hi"
                  >
                    <Edit2 size={14} /> Renombrar
                  </button>
                  <button
                    onClick={() => { onDeleteList(list.id); setMenuOpen(false); }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[#f79c8d] transition-colors hover:bg-state-crit/10"
                  >
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
                className={`min-h-[0.5rem] flex-1 space-y-2 overflow-y-auto px-2 transition-colors ${
                  snapshot.isDraggingOver ? 'rounded-panel bg-brand/[0.07] ring-1 ring-inset ring-brand/20' : ''
                }`}
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
                  className="input resize-none"
                  aria-label="Título de la tarjeta nueva"
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitCard(); } if (e.key === 'Escape') setAddingCard(false); }}
                />
                <div className="flex gap-2">
                  <button onClick={submitCard} className="btn-primary px-3 py-1.5 text-meta">Agregar</button>
                  <button onClick={() => { setAddingCard(false); setCardTitle(''); }} className="btn-icon" aria-label="Cancelar"><X size={17} /></button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setAddingCard(true)}
                className="tap-row flex w-full items-center gap-1.5 rounded-control px-2 py-2 text-left text-[0.82rem] text-ink-lo transition-colors hover:bg-white/[0.06] hover:text-ink-hi"
              >
                <Plus size={15} /> Agregar tarjeta
              </button>
            )}
          </div>
        </div>
      )}
    </Draggable>
  );
}
