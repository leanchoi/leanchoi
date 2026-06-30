'use client';
import { Draggable } from '@hello-pangea/dnd';
import { Calendar, CheckSquare, MessageSquare } from 'lucide-react';

interface Label { id: number; color: string; text: string; }
interface Card { id: number; title: string; description?: string; due_date?: string; position: number; labels: Label[]; }

export default function CardItem({ card, index, onClick }: { card: Card; index: number; onClick: () => void }) {
  const isOverdue = card.due_date && new Date(card.due_date) < new Date();

  return (
    <Draggable draggableId={`card-${card.id}`} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onClick={onClick}
          className={`bg-[#22272b] rounded-lg p-3 cursor-pointer shadow-sm hover:bg-[#2c3540] transition-colors ${snapshot.isDragging ? 'shadow-xl rotate-1 ring-2 ring-blue-500' : ''}`}
        >
          {card.labels.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {card.labels.map((label, i) => (
                <span key={i} className="h-2 min-w-[40px] rounded-full" style={{ background: label.color }} title={label.text} />
              ))}
            </div>
          )}
          <p className="text-[#b6c2cf] text-sm">{card.title}</p>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {card.due_date && (
              <span className={`flex items-center gap-1 text-xs px-1.5 py-0.5 rounded ${isOverdue ? 'bg-red-900/60 text-red-300' : 'text-[#8c9bab]'}`}>
                <Calendar size={11} />{new Date(card.due_date).toLocaleDateString('es')}
              </span>
            )}
            {card.description && <span className="text-[#8c9bab]"><MessageSquare size={12} /></span>}
          </div>
        </div>
      )}
    </Draggable>
  );
}
