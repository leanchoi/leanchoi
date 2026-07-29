'use client';
import { Draggable } from '@hello-pangea/dnd';
import { AlignLeft, CalendarClock } from 'lucide-react';
import Avatar from './Avatar';

interface Label { id: number; color: string; text: string; }
interface Member { user_id: number; display_name: string; avatar?: string | null; }
interface Card { id: number; title: string; description?: string; due_date?: string; position: number; cover_attachment_id?: number; labels: Label[]; members: Member[]; dimmed?: boolean; }

// Un vencimiento se lee mejor como estado que como fecha suelta: vencida,
// vence hoy, vence mañana, o simplemente la fecha.
function dueState(due?: string): { cls: string; text: string } | null {
  if (!due) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(due); d.setHours(0, 0, 0, 0);
  const days = Math.round((d.getTime() - today.getTime()) / 86400000);
  const fecha = d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
  if (days < 0) return { cls: 'chip-crit', text: `Vencida · ${fecha}` };
  if (days === 0) return { cls: 'chip-warn', text: 'Vence hoy' };
  if (days === 1) return { cls: 'chip-warn', text: 'Vence mañana' };
  return { cls: 'chip-neutral', text: fecha };
}

export default function CardItem({ card, index, onClick }: { card: Card; index: number; onClick: () => void }) {
  const due = dueState(card.due_date);
  const hasMeta = due || card.description || card.members.length > 0;

  return (
    <Draggable draggableId={`card-${card.id}`} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onClick={onClick}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
          aria-label={`Abrir tarjeta ${card.title}`}
          className={`group cursor-pointer overflow-hidden rounded-panel border bg-surface-raised transition-all duration-150
            ${snapshot.isDragging
              ? 'rotate-[0.6deg] border-brand/50 shadow-lift-3'
              : 'border-line/70 shadow-lift-1 hover:-translate-y-px hover:border-line-strong/70 hover:bg-surface-raised2 hover:shadow-lift-2'}
            ${card.dimmed ? 'opacity-25' : ''}`}
        >
          {card.cover_attachment_id && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/attachments/${card.cover_attachment_id}?inline=1`}
              alt=""
              className="h-28 w-full object-cover"
              draggable={false}
            />
          )}

          <div className="p-2.5">
            {card.labels.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1">
                {card.labels.map((label, i) => (
                  <span
                    key={i}
                    title={label.text}
                    className="h-1.5 min-w-[2.2rem] flex-1 rounded-full"
                    style={{ background: label.color, maxWidth: '3.5rem' }}
                  />
                ))}
              </div>
            )}

            <p className="text-[0.845rem] font-medium leading-snug text-ink-hi">{card.title}</p>

            {hasMeta && (
              <div className="mt-2.5 flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1.5">
                  {due && (
                    <span className={`chip ${due.cls} tnum`}>
                      <CalendarClock size={10} />
                      {due.text}
                    </span>
                  )}
                  {card.description && (
                    <span className="text-ink-lo" title="Tiene descripción">
                      <AlignLeft size={12} />
                    </span>
                  )}
                </div>
                {card.members.length > 0 && (
                  <div className="flex flex-shrink-0 -space-x-1.5">
                    {card.members.slice(0, 3).map(m => (
                      <Avatar
                        key={m.user_id}
                        userId={m.user_id}
                        name={m.display_name}
                        avatar={m.avatar}
                        size={22}
                        className="ring-2 ring-surface-raised"
                      />
                    ))}
                    {card.members.length > 3 && (
                      <div className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-surface-hover text-[0.6rem] font-semibold text-ink-md ring-2 ring-surface-raised">
                        +{card.members.length - 3}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </Draggable>
  );
}
