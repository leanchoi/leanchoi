'use client';
import { useState, useCallback, useEffect } from 'react';
import { DragDropContext, Droppable, DropResult } from '@hello-pangea/dnd';
import ListColumn from './ListColumn';
import CardModal from './CardModal';
import { Plus, X, ArrowLeft, Filter, Tag, Share2, Check, Globe, Trash2, Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import LabelManager, { BoardLabel } from './LabelManager';
import { useToast, apiCall } from './Toast';

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

export default function BoardView({ board, initialLists, initialCards, boardUsers, initialBoardLabels, currentUserName, isAdmin, canDelete = false, readOnly = null }: {
  board: Board; initialLists: List[]; initialCards: Card[]; boardUsers: User[]; initialBoardLabels: BoardLabel[]; currentUserName: string; isAdmin: boolean; canDelete?: boolean;
  /** Motivo por el que la rama está en solo lectura, o null si se puede editar */
  readOnly?: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const canWrite = !readOnly;
  const searchParams = useSearchParams();
  const cardIdParam = searchParams.get('cardId');
  const itemIdParam = searchParams.get('itemId');
  const highlightParam = searchParams.get('highlight');

  useEffect(() => {
    if (cardIdParam) {
      setSelectedCardId(Number(cardIdParam));
    } else {
      setSelectedCardId(null);
    }
  }, [cardIdParam]);

  async function deleteBoard() {
    if (!confirm(`¿Eliminar el tablero "${board.title}" y todo su contenido? Esta acción no se puede deshacer.`)) return;
    const ok = await apiCall(`/api/boards/${board.id}`, { method: 'DELETE' }, toast, 'No se pudo eliminar el tablero');
    if (!ok) return;
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
  const [searchQuery, setSearchQuery] = useState('');
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
    const ok = await apiCall(
      `/api/boards/${board.id}/share`,
      { method: has ? 'DELETE' : 'POST', body: JSON.stringify({ userId }) },
      toast,
      'No se pudo cambiar el acceso'
    );
    if (!ok) return;
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
  const hasFilters = filterLabels.length > 0 || filterUsers.length > 0 || filterDates.length > 0 || searchQuery.trim() !== '';

  function cardMatchesFilters(card: Card): boolean {
    if (filterLabels.length > 0 && !card.labels.some(l => filterLabels.includes(l.color))) return false;
    if (filterUsers.length > 0 && !card.members.some(m => filterUsers.includes(m.user_id))) return false;
    if (filterDates.length > 0 && !filterDates.some(d => checkDate(card.due_date, d))) return false;
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      const matchTitle = card.title.toLowerCase().includes(q);
      const matchDesc = (card.description || '').toLowerCase().includes(q);
      if (!matchTitle && !matchDesc) return false;
    }
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
  function clearFilters() { setFilterLabels([]); setFilterUsers([]); setFilterDates([]); setSearchQuery(''); }

  const cardsForList = (listId: number) => cards
    .filter(c => c.list_id === listId)
    .sort((a, b) => a.position - b.position)
    .map(c => ({ ...c, dimmed: hasFilters && !cardMatchesFilters(c) }));

  // Un solo POST en lote por arrastre. Antes se mandaba un PATCH por cada
  // tarjeta de la lista destino, encadenados con await: mover algo en una lista
  // de 30 tarjetas eran 30 viajes al servidor, uno detrás del otro.
  const onDragEnd = useCallback(async (result: DropResult) => {
    const { destination, source, draggableId, type } = result;
    if (!destination || !canWrite) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    if (type === 'LIST') {
      const prevLists = lists;
      const reordered = Array.from(lists);
      const [moved] = reordered.splice(source.index, 1);
      reordered.splice(destination.index, 0, moved);
      const updated = reordered.map((l, i) => ({ ...l, position: i + 1 }));
      setLists(updated);
      const ok = await apiCall(
        `/api/boards/${board.id}/reorder`,
        { method: 'POST', body: JSON.stringify({ lists: updated.map(l => ({ id: l.id, position: l.position })) }) },
        toast,
        'No se pudo reordenar las listas'
      );
      if (!ok) setLists(prevLists); // revertir el optimismo si el server dijo que no
      return;
    }

    const cardId = Number(draggableId.replace('card-', ''));
    const destListId = Number(destination.droppableId.replace('list-', ''));
    const prevCards = cards;
    const destCards = cards.filter(c => c.list_id === destListId && c.id !== cardId).sort((a, b) => a.position - b.position);
    const movedCard = cards.find(c => c.id === cardId);
    if (!movedCard) return;
    destCards.splice(destination.index, 0, movedCard);
    const updatedPositions = destCards.map((c, i) => ({ ...c, list_id: destListId, position: i + 1 }));
    setCards(prev => prev.map(c => { const u = updatedPositions.find(u => u.id === c.id); return u || c; }));

    const ok = await apiCall(
      `/api/boards/${board.id}/reorder`,
      {
        method: 'POST',
        body: JSON.stringify({
          cards: updatedPositions.map(c => ({ id: c.id, list_id: destListId, position: c.position })),
        }),
      },
      toast,
      'No se pudo mover la tarjeta'
    );
    if (!ok) setCards(prevCards);
  }, [lists, cards, board.id, canWrite, toast]);


  // Un tablero recién creado quedaba en blanco, sin ninguna pista de por dónde
  // empezar. Este atajo arma el flujo más habitual de una sola vez.
  async function seedStarterLists() {
    const titles = ['Por hacer', 'En curso', 'Hecho'];
    const created: List[] = [];
    for (const title of titles) {
      const list = await apiCall<List>(
        `/api/boards/${board.id}/lists`,
        { method: 'POST', body: JSON.stringify({ title }) },
        toast,
        'No se pudieron crear las listas'
      );
      if (!list?.id) break;
      created.push(list);
    }
    if (created.length) setLists(prev => [...prev, ...created]);
  }

  async function addList() {
    if (!newListTitle.trim()) return;
    // Antes no se miraba res.ok: con la rama vencida el {error} del backend se
    // insertaba como si fuera una lista y aparecía una columna fantasma.
    const list = await apiCall<List>(
      `/api/boards/${board.id}/lists`,
      { method: 'POST', body: JSON.stringify({ title: newListTitle.trim() }) },
      toast,
      'No se pudo crear la lista'
    );
    if (!list?.id) return;
    setLists(prev => [...prev, list]);
    setNewListTitle(''); setAddingList(false);
  }

  async function addCard(listId: number, title: string) {
    const card = await apiCall<Card>(
      `/api/lists/${listId}/cards`,
      { method: 'POST', body: JSON.stringify({ title }) },
      toast,
      'No se pudo crear la tarjeta'
    );
    if (!card?.id) return;
    setCards(prev => [...prev, { ...card, labels: [], members: [] }]);
  }

  async function deleteCard(cardId: number) {
    const ok = await apiCall(`/api/cards/${cardId}`, { method: 'DELETE' }, toast, 'No se pudo borrar la tarjeta');
    if (!ok) return;
    setCards(prev => prev.filter(c => c.id !== cardId));
    setSelectedCardId(null);
  }

  async function deleteList(listId: number) {
    const list = lists.find(l => l.id === listId);
    const count = cards.filter(c => c.list_id === listId).length;
    const msg = count > 0
      ? `¿Eliminar la lista "${list?.title || ''}" y sus ${count} tarjeta${count === 1 ? '' : 's'}? No se puede deshacer.`
      : `¿Eliminar la lista "${list?.title || ''}"?`;
    if (!confirm(msg)) return;
    const ok = await apiCall(`/api/lists/${listId}`, { method: 'DELETE' }, toast, 'No se pudo borrar la lista');
    if (!ok) return;
    setLists(prev => prev.filter(l => l.id !== listId));
    setCards(prev => prev.filter(c => c.list_id !== listId));
    toast.success('Lista eliminada');
  }

  async function renameList(listId: number, title: string) {
    const prev = lists;
    setLists(p => p.map(l => l.id === listId ? { ...l, title } : l));
    const ok = await apiCall(
      `/api/lists/${listId}`,
      { method: 'PATCH', body: JSON.stringify({ title }) },
      toast,
      'No se pudo renombrar la lista'
    );
    if (!ok) setLists(prev);
  }

  function updateCardLocal(card: Card) {
    setCards(prev => prev.map(c => c.id === card.id ? { ...c, ...card } : c));
  }

  // Tablero recién creado: se muestra la guía en vez de una pantalla en blanco
  const showEmptyState = lists.length === 0 && canWrite && !addingList;

  const selectedCard = selectedCardId ? cards.find(c => c.id === selectedCardId) : null;
  const selectedList = selectedCard ? lists.find(l => l.id === selectedCard.list_id) : null;

  return (
    <>
      {readOnly && (
        <div className="border-b border-amber-500/30 bg-amber-500/15 px-4 py-1.5 text-center text-xs text-amber-200">
          🔒 {readOnly}
        </div>
      )}
      <div className="px-4 py-2 bg-black/20 backdrop-blur">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 mb-2">
          <Link href="/boards" aria-label="Volver a mis proyectos" className="text-white/70 hover:text-white transition-colors"><ArrowLeft size={18} /></Link>
          <h1 className="text-white font-bold text-lg truncate max-w-[45vw] sm:max-w-none">{board.title}</h1>
          <button onClick={() => setShowFilters(!showFilters)} className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg transition-colors ${showFilters || hasFilters ? 'bg-teal-600 text-white' : 'bg-white/20 text-white hover:bg-white/30'}`}>
            <Filter size={13} /> Filtrar {(filterLabels.length + filterUsers.length + filterDates.length) > 0 && `(${filterLabels.length + filterUsers.length + filterDates.length})`}
          </button>

          {/* Search bar (lupita) */}
          <div className="relative flex items-center">
            <span className="absolute left-2.5 text-white/50 pointer-events-none">
              <Search size={13} />
            </span>
            <input
              type="text"
              placeholder="Buscar tarjetas..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              aria-label="Buscar tarjetas en este tablero"
              className="bg-white/10 hover:bg-white/15 focus:bg-white/20 text-white placeholder-white/40 text-xs rounded-lg pl-8 pr-7 py-1 w-32 sm:w-44 transition-all focus:outline-none focus:ring-1 focus:ring-teal-400"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 text-white/50 hover:text-white"
              >
                <X size={12} />
              </button>
            )}
          </div>
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
              title="Eliminar tablero" aria-label="Eliminar tablero"
              className="sm:ml-auto flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg bg-white/10 text-white/80 hover:bg-red-600 hover:text-white transition-colors"
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

      {showEmptyState && (
        <div className="flex flex-1 items-start justify-center p-4">
          <div className="mt-10 max-w-md rounded-surface border border-white/15 bg-black/25 p-6 text-center backdrop-blur">
            <p className="text-white font-semibold">Este tablero está vacío</p>
            <p className="mt-1 text-sm text-white/75">
              Las listas son las etapas del trabajo y las tarjetas, lo que hay que hacer en cada una.
            </p>
            <div className="mt-4 flex flex-col items-stretch gap-2 sm:flex-row sm:justify-center">
              <button
                onClick={seedStarterLists}
                className="rounded-control bg-teal-600 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-500"
              >
                Empezar con Por hacer · En curso · Hecho
              </button>
              <button
                onClick={() => setAddingList(true)}
                className="rounded-control bg-white/15 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-white/25"
              >
                Crear mi primera lista
              </button>
            </div>
          </div>
        </div>
      )}

      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId="board" type="LIST" direction="horizontal">
          {(provided) => (
            <div
              ref={provided.innerRef}
              {...provided.droppableProps}
              className={`flex gap-3 p-4 overflow-x-auto items-start ${showEmptyState ? 'hidden' : 'flex-1'}`}
            >
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
                {!canWrite ? null : addingList ? (
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
          onClose={() => {
            setSelectedCardId(null);
            router.replace(`/boards/${board.id}`);
          }}
          onDelete={() => deleteCard(selectedCard.id)}
          onUpdate={updateCardLocal}
          highlightItemId={itemIdParam ? Number(itemIdParam) : undefined}
          highlightDueDate={highlightParam === 'due_date'}
        />
      )}
    </>
  );
}
