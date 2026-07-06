'use client';
import { useState, useCallback } from 'react';
import { DragDropContext, Droppable, DropResult } from '@hello-pangea/dnd';
import ListColumn from './ListColumn';
import CardModal from './CardModal';
import { Plus, X, ArrowLeft, Filter, Tag, Share2, Check, Globe, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import LabelManager, { BoardLabel } from './LabelManager';

interface Label { id: number; color: string; text: string; }
interface Member { user_id: number; display_name: string; }
interface Card { id: number; list_id: number; title: string; description?: string; due_date?: string; position: number; cover_attachment_id?: number; labels: Label[]; members: Member[]; }
interface List { id: number; board_id: number; title: string; position: number; }
interface Board { id: number; title: string; background: string; is_public?: number; }
interface User { id: number; display_name: string; username: string; }

const DATE_FILTERS = [
  { key: 'overdue', label: 'Vencidas' },
  { key: 'today', label: 'Hoy' },
  { key: 'tomorrow', label: 'Mañana' },
  { key: 'no_date', label: 'Sin fecha' },
];

function checkDate(dueDate: string | undefined, type: string): boolean {
  const today = new Date(); today.setHours(0,0,0,0);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate()+1);
  if (type === 'no_date') return !dueDate;
  if (!dueDate) return false;
  const due = new Date(dueDate); due.setHours(0,0,0,0);
  if (type === 'overdue') return due < today;
  if (type === 'today') return due.getTime() === today.getTime();
  if (type === 'tomorrow') return due.getTime() === tomorrow.getTime();
  return false;
}

export default function BoardView({ board, initialLists, initialCards, boardUsers, initialBoardLabels, currentUserName, isAdmin, canDelete = false }: {
  board: Board; initialLists: List[]; initialCards: Card[]; boardUsers: User[]; initialBoardLabels: BoardLabel[]; currentUserName: string; isAdmin: boolean; canDelete?: boolean;
}) {
  const router = useRouter();
  async function deleteBoard() {
    if (!confirm(`¿Eliminar el tablero "${board.title}" y todo su contenido? Esta acción no se puede deshacer.`)) return;
    const res = await fetch(`/api/boards/${board.id}`, { method: 'DELETE' });
    if (!res.ok) {
      alert((await res.json().catch(() => ({}))).error || 'No se pudo eliminar');
      return;
    }
    router.push('/boards');
  }
  const [lists, setLists] = useState<List[]>(initialLists);
  const [cards, setCards] = useState<Card[]>(initialCards);
  const [boardLabels, setBoardLabels] = useState<BoardLabel[]>(initialBoardLabels);
  const [selectedCardId, setSelectedCardId] = useState<number | null>(null);
  const [addingList, setAddingList] = useState(false);
  const [newListTitle, setNewListTitle] = useState('');
  const [filterLabels, setFilterLabels] = useState<string[]>([]);
  const [filterUsers, setFilterUsers] = useState<number[]>([]);
  const [filterDates, setFilterDates] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [showLabelManager, setShowLabelManager] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [shareData, setShareData] = useState<{ members: User[]; allUsers: User[] } | null>(null);

  async function openShare() {
    setShowShare(!showShare);
    setShowLabelManager(false);
    if (!showShare && !shareData) {
      const res = await fetch(`/api/boards/${board.id}/share`);
      if (res.ok) {
        const data = await res.json();
        setShareData({ members: data.members, allUsers: data.allUsers });
      }
    }
  }

  async function toggleShareMember(userId: number, has: boolean) {
    await fetch(`/api/boards/${board.id}/share`, {
      method: has ? 'DELETE' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    setShareData(prev => prev ? {
      ...prev,
      members: has ? prev.members.filter(m => m.id !== userId) : [...prev.members, prev.allUsers.find(u => u.id === userId)!],
    } : prev);
  }

  // Keep card labels in sync when a board label is renamed/recolored or deleted
  function onLabelUpdated(oldLabel: BoardLabel, newLabel: BoardLabel) {
    setCards(prev => prev.map(c => ({
      ...c,
      labels: c.labels.map(l => l.color === oldLabel.color ? { ...l, color: newLabel.color, text: newLabel.name } : l),
    })));
  }
  function onLabelDeleted(label: BoardLabel) {
    setCards(prev => prev.map(c => ({ ...c, labels: c.labels.filter(l => l.color !== label.color) })));
  }
  function labelName(color: string): string {
    return boardLabels.find(b => b.color === color)?.name || '';
  }

  const usedColors = Array.from(new Set(cards.flatMap(c => c.labels.map(l => l.color))));
  const hasFilters = filterLabels.length > 0 || filterUsers.length > 0 || filterDates.length > 0;

  function cardMatchesFilters(card: Card): boolean {
    if (filterLabels.length > 0 && !card.labels.some(l => filterLabels.includes(l.color))) return false;
    if (filterUsers.length > 0 && !card.members.some(m => filterUsers.includes(m.user_id))) return false;
    if (filterDates.length > 0 && !filterDates.some(d => checkDate(card.due_date, d))) return false;
    return true;
  }

  function toggleLabel(color: string) {
    setFilterLabels(prev => prev.includes(color) ? prev.filter(c => c !== color) : [...prev, color]);
  }
  function toggleUser(id: number) {
    setFilterUsers(prev => prev.includes(id) ? prev.filter(u => u !== id) : [...prev, id]);
  }
  function toggleDate(key: string) {
    setFilterDates(prev => prev.includes(key) ? prev.filter(d => d !== key) : [...prev, key]);
  }
  function clearFilters() { setFilterLabels([]); setFilterUsers([]); setFilterDates([]); }

  const cardsForList = (listId: number) => cards
    .filter(c => c.list_id === listId)
    .sort((a, b) => a.position - b.position)
    .map(c => ({ ...c, dimmed: hasFilters && !cardMatchesFilters(c) }));

  const onDragEnd = useCallback(async (result: DropResult) => {
    const { destination, source, draggableId, type } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    if (type === 'LIST') {
      const reordered = Array.from(lists);
      const [moved] = reordered.splice(source.index, 1);
      reordered.splice(destination.index, 0, moved);
      const updated = reordered.map((l, i) => ({ ...l, position: i + 1 }));
      setLists(updated);
      for (const l of updated) {
        await fetch(`/api/lists/${l.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ position: l.position }) });
      }
      return;
    }

    const cardId = Number(draggableId.replace('card-', ''));
    const destListId = Number(destination.droppableId.replace('list-', ''));
    const destCards = cards.filter(c => c.list_id === destListId && c.id !== cardId).sort((a, b) => a.position - b.position);
    destCards.splice(destination.index, 0, cards.find(c => c.id === cardId)!);
    const updatedPositions = destCards.map((c, i) => ({ ...c, list_id: destListId, position: i + 1 }));
    setCards(prev => prev.map(c => { const u = updatedPositions.find(u => u.id === c.id); return u || c; }));
    await fetch(`/api/cards/${cardId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ list_id: destListId, position: destination.index + 1 }) });
    for (const c of updatedPositions) {
      if (c.id !== cardId) await fetch(`/api/cards/${c.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ position: c.position }) });
    }
  }, [lists, cards]);

  async function addList() {
    if (!newListTitle.trim()) return;
    const res = await fetch(`/api/boards/${board.id}/lists`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: newListTitle.trim() }) });
    const list = await res.json();
    setLists(prev => [...prev, list]);
    setNewListTitle(''); setAddingList(false);
  }

  async function addCard(listId: number, title: string) {
    const res = await fetch(`/api/lists/${listId}/cards`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) });
    const card = await res.json();
    setCards(prev => [...prev, { ...card, labels: [], members: [] }]);
  }

  async function deleteCard(cardId: number) {
    await fetch(`/api/cards/${cardId}`, { method: 'DELETE' });
    setCards(prev => prev.filter(c => c.id !== cardId));
    setSelectedCardId(null);
  }

  async function deleteList(listId: number) {
    await fetch(`/api/lists/${listId}`, { method: 'DELETE' });
    setLists(prev => prev.filter(l => l.id !== listId));
    setCards(prev => prev.filter(c => c.list_id !== listId));
  }

  async function renameList(listId: number, title: string) {
    await fetch(`/api/lists/${listId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) });
    setLists(prev => prev.map(l => l.id === listId ? { ...l, title } : l));
  }

  function updateCardLocal(card: Card) {
    setCards(prev => prev.map(c => c.id === card.id ? { ...c, ...card } : c));
  }

  const selectedCard = selectedCardId ? cards.find(c => c.id === selectedCardId) : null;
  const selectedList = selectedCard ? lists.find(l => l.id === selectedCard.list_id) : null;

  return (
    <>
      <div className="px-4 py-2 bg-black/20 backdrop-blur">
        <div className="flex items-center gap-3 mb-2">
          <Link href="/boards" className="text-white/70 hover:text-white transition-colors"><ArrowLeft size={18} /></Link>
          <h1 className="text-white font-bold text-lg">{board.title}</h1>
          <button onClick={() => setShowFilters(!showFilters)} className={`ml-2 flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg transition-colors ${showFilters || hasFilters ? 'bg-teal-600 text-white' : 'bg-white/20 text-white hover:bg-white/30'}`}>
            <Filter size={13} /> Filtrar {hasFilters && `(${filterLabels.length + filterUsers.length + filterDates.length})`}
          </button>
          <div className="relative">
            <button onClick={() => setShowLabelManager(!showLabelManager)} className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg transition-colors ${showLabelManager ? 'bg-teal-600 text-white' : 'bg-white/20 text-white hover:bg-white/30'}`}>
              <Tag size={13} /> Etiquetas
            </button>
            {showLabelManager && (
              <div className="absolute left-0 top-full mt-1.5 bg-[#243447] border border-[#3b5068] rounded-xl shadow-2xl z-50 w-72 p-3">
                <p className="text-[#94a3b8] text-xs font-semibold mb-2">Etiquetas del tablero</p>
                <LabelManager
                  boardId={board.id}
                  labels={boardLabels}
                  onChange={setBoardLabels}
                  onLabelUpdated={onLabelUpdated}
                  onLabelDeleted={onLabelDeleted}
                />
              </div>
            )}
          </div>
          <div className="relative">
            <button onClick={openShare} className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg transition-colors ${showShare ? 'bg-teal-600 text-white' : 'bg-white/20 text-white hover:bg-white/30'}`}>
              <Share2 size={13} /> Compartir
            </button>
            {showShare && (
              <div className="absolute left-0 top-full mt-1.5 bg-[#243447] border border-[#3b5068] rounded-xl shadow-2xl z-50 w-64 p-3 max-h-80 overflow-y-auto">
                <p className="text-[#94a3b8] text-xs font-semibold mb-2">Compartir tablero</p>
                {board.is_public ? (
                  <p className="text-sky-300 text-xs flex items-center gap-1.5 mb-2"><Globe size={12} /> Este tablero es global: todos lo ven.</p>
                ) : null}
                {!shareData ? (
                  <p className="text-[#94a3b8] text-xs py-2">Cargando...</p>
                ) : (
                  <div className="space-y-0.5">
                    {shareData.allUsers.map(u => {
                      const has = shareData.members.some(m => m.id === u.id);
                      return (
                        <button key={u.id} onClick={() => toggleShareMember(u.id, has)}
                          className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[#3b5068] text-sm text-left">
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${has ? 'bg-teal-600' : 'bg-[#475569]'}`}>{u.display_name.charAt(0).toUpperCase()}</div>
                          <span className={has ? 'text-white' : 'text-[#cbd5e1]'}>{u.display_name}</span>
                          {has && <Check size={12} className="ml-auto text-teal-300" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
          {hasFilters && <button onClick={clearFilters} className="text-white/60 hover:text-white text-xs flex items-center gap-1"><X size={12} /> Limpiar</button>}
          {canDelete && (
            <button
              onClick={deleteBoard}
              title="Eliminar tablero"
              className="ml-auto flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg bg-white/10 text-white/80 hover:bg-red-600 hover:text-white transition-colors"
            >
              <Trash2 size={13} /> <span className="hidden sm:inline">Eliminar</span>
            </button>
          )}
        </div>

        {showFilters && (
          <div className="flex flex-wrap gap-4 pb-2">
            {usedColors.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-white/60 text-xs">Etiquetas:</span>
                <div className="flex gap-1.5 flex-wrap">
                  {usedColors.map(color => (
                    <button key={color} onClick={() => toggleLabel(color)} title={labelName(color)} className={`h-6 rounded-full border-2 transition-all text-white text-xs font-medium ${labelName(color) ? 'px-2' : 'w-6'}`} style={{ background: color, borderColor: filterLabels.includes(color) ? 'white' : 'transparent' }}>
                      {labelName(color)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {boardUsers.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-white/60 text-xs">Responsable:</span>
                <div className="flex gap-1.5 flex-wrap">
                  {boardUsers.map(u => (
                    <button key={u.id} onClick={() => toggleUser(u.id)} className={`text-xs px-2 py-0.5 rounded-full border transition-all ${filterUsers.includes(u.id) ? 'bg-teal-600 border-teal-300 text-white' : 'bg-white/10 border-white/20 text-white/80 hover:bg-white/20'}`}>
                      {u.display_name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center gap-2">
              <span className="text-white/60 text-xs">Vencimiento:</span>
              <div className="flex gap-1.5">
                {DATE_FILTERS.map(f => (
                  <button key={f.key} onClick={() => toggleDate(f.key)} className={`text-xs px-2 py-0.5 rounded-full border transition-all ${filterDates.includes(f.key) ? 'bg-teal-600 border-teal-300 text-white' : 'bg-white/10 border-white/20 text-white/80 hover:bg-white/20'}`}>
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId="board" type="LIST" direction="horizontal">
          {(provided) => (
            <div ref={provided.innerRef} {...provided.droppableProps} className="flex gap-3 p-4 overflow-x-auto flex-1 items-start">
              {lists.map((list, index) => (
                <ListColumn
                  key={list.id}
                  list={list}
                  index={index}
                  cards={cardsForList(list.id)}
                  onAddCard={addCard}
                  onDeleteList={deleteList}
                  onRenameList={renameList}
                  onCardClick={setSelectedCardId}
                />
              ))}
              {provided.placeholder}

              <div className="flex-shrink-0 w-72">
                {addingList ? (
                  <div className="bg-[#0b1220] rounded-xl p-3 space-y-2">
                    <input
                      autoFocus
                      value={newListTitle}
                      onChange={e => setNewListTitle(e.target.value)}
                      placeholder="Ingresá un título..."
                      className="w-full bg-white text-gray-900 text-sm rounded px-3 py-1.5 focus:outline-none"
                      onKeyDown={e => { if (e.key === 'Enter') addList(); if (e.key === 'Escape') setAddingList(false); }}
                    />
                    <div className="flex gap-2">
                      <button onClick={addList} className="bg-teal-600 hover:bg-teal-500 text-white text-sm px-3 py-1 rounded font-medium">Agregar lista</button>
                      <button onClick={() => setAddingList(false)} className="text-gray-400 hover:text-white"><X size={18} /></button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setAddingList(true)} className="w-full text-left px-3 py-2.5 rounded-xl bg-white/20 hover:bg-white/30 text-white text-sm font-medium flex items-center gap-2 transition-colors">
                    <Plus size={16} /> Agregar lista
                  </button>
                )}
              </div>
            </div>
          )}
        </Droppable>
      </DragDropContext>

      {selectedCard && selectedList && (
        <CardModal
          card={selectedCard}
          listName={selectedList.title}
          currentUserName={currentUserName}
          allUsers={boardUsers}
          boardId={board.id}
          boardLabels={boardLabels}
          onBoardLabelsChange={setBoardLabels}
          onBoardLabelUpdated={onLabelUpdated}
          onBoardLabelDeleted={onLabelDeleted}
          onClose={() => setSelectedCardId(null)}
          onDelete={() => deleteCard(selectedCard.id)}
          onUpdate={updateCardLocal}
        />
      )}
    </>
  );
}
