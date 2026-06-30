'use client';
import { useState, useCallback } from 'react';
import { DragDropContext, Droppable, DropResult } from '@hello-pangea/dnd';
import ListColumn from './ListColumn';
import CardModal from './CardModal';
import { Plus, X, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

interface Label { id: number; color: string; text: string; }
interface Card { id: number; list_id: number; title: string; description?: string; due_date?: string; position: number; labels: Label[]; }
interface List { id: number; board_id: number; title: string; position: number; }
interface Board { id: number; title: string; background: string; }

export default function BoardView({ board, initialLists, initialCards, currentUserName, isAdmin }: {
  board: Board; initialLists: List[]; initialCards: Card[]; currentUserName: string; isAdmin: boolean;
}) {
  const [lists, setLists] = useState<List[]>(initialLists);
  const [cards, setCards] = useState<Card[]>(initialCards);
  const [selectedCardId, setSelectedCardId] = useState<number | null>(null);
  const [addingList, setAddingList] = useState(false);
  const [newListTitle, setNewListTitle] = useState('');

  const cardsForList = (listId: number) => cards.filter(c => c.list_id === listId).sort((a, b) => a.position - b.position);

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
    setCards(prev => [...prev, { ...card, labels: [] }]);
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
      <div className="flex items-center gap-3 px-4 py-3 bg-black/20 backdrop-blur">
        <Link href="/boards" className="text-white/70 hover:text-white transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <h1 className="text-white font-bold text-lg">{board.title}</h1>
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
                  <div className="bg-[#101204] rounded-xl p-3 space-y-2">
                    <input
                      autoFocus
                      value={newListTitle}
                      onChange={e => setNewListTitle(e.target.value)}
                      placeholder="Ingresá un título..."
                      className="w-full bg-white text-gray-900 text-sm rounded px-3 py-1.5 focus:outline-none"
                      onKeyDown={e => { if (e.key === 'Enter') addList(); if (e.key === 'Escape') setAddingList(false); }}
                    />
                    <div className="flex gap-2">
                      <button onClick={addList} className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-3 py-1 rounded font-medium">Agregar lista</button>
                      <button onClick={() => setAddingList(false)} className="text-gray-400 hover:text-white"><X size={18} /></button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setAddingList(true)}
                    className="w-full text-left px-3 py-2.5 rounded-xl bg-white/20 hover:bg-white/30 text-white text-sm font-medium flex items-center gap-2 transition-colors"
                  >
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
          onClose={() => setSelectedCardId(null)}
          onDelete={() => deleteCard(selectedCard.id)}
          onUpdate={updateCardLocal}
        />
      )}
    </>
  );
}
