'use client';
import { Draggable } from '@hello-pangea/dnd';
import { Calendar, MessageSquare } from 'lucide-react';
import Avatar from './Avatar';

interface Label { id: number; color: string; text: string; }
interface Member { user_id: number; display_name: string; avatar?: string | null; }
interface Card { id: number; title: string; description?: string; due_date?: string; position: number; cover_attachment_id?: number; labels: Label[]; members: Member[]; dimmed?: boolean; }

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
          className={`bg-[#1e293b] rounded-lg overflow-hidden cursor-pointer shadow-sm hover:bg-[#2e415c] transition-all ${snapshot.isDragging ? 'shadow-xl rotate-1 ring-2 ring-teal-400' : ''} ${card.dimmed ? 'opacity-25' : ''}`}
        >
          {card.cover_attachment_id && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/attachments/${card.cover_attachment_id}?inline=1`} alt="" className="w-full h-32 object-cover" draggable={false} />
          )}
          <div className="p-3">
            {card.labels.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-2">
                {card.labels.map((label, i) => (
                  <span key={i} className="h-2 min-w-[40px] rounded-full" style={{ background: label.color }} title={label.text} />
                ))}
              </div>
            )}
            <p className="text-[#cbd5e1] text-sm">{card.title}</p>
            <div className="flex items-center justify-between mt-2">
              <div className="flex items-center gap-2 flex-wrap">
                {card.due_date && (
                  <span className={`flex items-center gap-1 text-xs px-1.5 py-0.5 rounded ${isOverdue ? 'bg-red-900/60 text-red-300' : 'text-[#94a3b8]'}`}>
                    <Calendar size={11} />{new Date(card.due_date).toLocaleDateString('es')}
                  </span>
                )}
                {card.description && <span className="text-[#94a3b8]"><MessageSquare size={12} /></span>}
              </div>
              {card.members.length > 0 && (
                <div className="flex -space-x-1">
                  {card.members.slice(0, 3).map(m => (
                    <Avatar key={m.user_id} userId={m.user_id} name={m.display_name} avatar={m.avatar} size={24} className="border-2 border-[#1e293b]" />
                  ))}
                  {card.members.length > 3 && (
                    <div className="w-6 h-6 rounded-full bg-[#475569] border-2 border-[#1e293b] flex items-center justify-center text-white text-xs">+{card.members.length - 3}</div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </Draggable>
  );
}
