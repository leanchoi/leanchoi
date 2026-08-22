/**
 * Rastreador de misiones — la libretita del militante.
 *
 * Widget lateral con las misiones vivas del turno: qué hay que hacer, cuánto
 * falta, cuánto pagan y el reloj corriendo. Las que están en disputa con otra
 * facción se marcan en rojo, porque ahí el que llega segundo cobra la mitad.
 *
 * El progreso lo manda el servidor (`onQuestProgress`); acá sólo se dibuja.
 * Unirse y abandonar son mensajes al room: la UI nunca decide recompensas.
 */

import { useEffect, useMemo, useState } from 'react';
import { Flag, Swords, Timer, Trophy, X } from 'lucide-react';
import { QUEST_LABELS, type QuestType } from '@esquel/shared';
import { networkClient } from '../net/NetworkClient.ts';
import { formatMoney, useGameStore, type QuestEntry } from '../state/gameStore.ts';

/** Cuántas misiones se muestran a la vez antes de plegar el resto. */
const VISIBLES = 3;

const restante = (endsAt: number, ahora: number): string => {
  const s = Math.max(0, Math.round((endsAt - ahora) / 1000));
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}:${String(s % 60).padStart(2, '0')}` : `${s}s`;
};

const etiqueta = (tipo: string): string => QUEST_LABELS[tipo as QuestType] ?? tipo;

/** Una misión: objetivos, barra de avance y acciones. */
const QuestCard = ({ quest, ahora }: { quest: QuestEntry; ahora: number }): JSX.Element => {
  const segundos = Math.max(0, Math.round((quest.endsAt - ahora) / 1000));
  const urgente = segundos <= 45;
  const pct = Math.round(Math.min(1, Math.max(0, quest.completion)) * 100);

  return (
    <li className={`quests__card${quest.joined ? ' is-joined' : ''}${quest.contested ? ' is-contested' : ''}`}>
      <header className="quests__head">
        <span className="quests__type">{etiqueta(quest.type)}</span>
        <span className={`quests__timer${urgente ? ' is-urgent' : ''}`}>
          <Timer size={11} strokeWidth={2.5} aria-hidden /> {restante(quest.endsAt, ahora)}
        </span>
      </header>

      <p className="quests__title">{quest.title}</p>
      <p className="quests__desc">{quest.description}</p>

      <ul className="quests__objectives">
        {quest.objectives.map((obj) => {
          const hecho = quest.counters[obj.id] ?? 0;
          const listo = hecho >= obj.target;
          return (
            <li key={obj.id} className={`quests__obj${listo ? ' is-done' : ''}${obj.optional ? ' is-optional' : ''}`}>
              <span className="quests__obj-label">
                {obj.label}
                {obj.optional ? ' (opcional)' : ''}
              </span>
              <span className="quests__obj-count">
                {Math.min(hecho, obj.target)}/{obj.target}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="quests__bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <span className="quests__bar-fill" style={{ width: `${pct}%` }} />
      </div>

      <footer className="quests__foot">
        <span className="quests__rewards">
          <Trophy size={11} strokeWidth={2.5} aria-hidden /> {quest.rewards.xp} XP · +{quest.rewards.reputation} rep ·{' '}
          {formatMoney(quest.rewards.money)}
        </span>
        {quest.contested ? (
          <span className="quests__contested" title="Otra facción va por lo mismo: el segundo cobra la mitad.">
            <Swords size={11} strokeWidth={2.5} aria-hidden /> en disputa
          </span>
        ) : null}
        {quest.joined ? (
          <button type="button" className="quests__btn quests__btn--drop" onClick={() => networkClient.abandonQuest(quest.id)}>
            <X size={11} strokeWidth={3} aria-hidden /> Bajarme
          </button>
        ) : (
          <button type="button" className="quests__btn" onClick={() => networkClient.joinQuest(quest.id)}>
            <Flag size={11} strokeWidth={3} aria-hidden /> Anotarme
          </button>
        )}
      </footer>
    </li>
  );
};

export const QuestTracker = (): JSX.Element | null => {
  const quests = useGameStore((s) => s.quests);
  const buff = useGameStore((s) => s.territoryBuff);
  const [ahora, setAhora] = useState(() => Date.now());
  const [desplegado, setDesplegado] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => setAhora(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  /** Primero las propias, después las que vencen antes. */
  const ordenadas = useMemo(
    () => [...quests].sort((a, b) => Number(b.joined) - Number(a.joined) || a.endsAt - b.endsAt),
    [quests],
  );

  if (ordenadas.length === 0) return null;

  const mostradas = desplegado ? ordenadas : ordenadas.slice(0, VISIBLES);
  const ocultas = ordenadas.length - mostradas.length;

  return (
    <section className="quests" aria-label="Misiones activas">
      <header className="quests__panel-head">
        <span>Rosca del momento</span>
        {buff.zones > 0 ? (
          <span className="quests__buff" title={`${buff.zones} zona(s) bajo control de tu facción`}>
            ×{buff.xp.toFixed(2)} XP · ×{buff.money.toFixed(2)} guita
          </span>
        ) : null}
      </header>

      <ul className="quests__list">
        {mostradas.map((q) => (
          <QuestCard key={q.id} quest={q} ahora={ahora} />
        ))}
      </ul>

      {ocultas > 0 || desplegado ? (
        <button type="button" className="quests__more" onClick={() => setDesplegado((v) => !v)}>
          {desplegado ? 'Ver menos' : `+${ocultas} más dando vueltas`}
        </button>
      ) : null}
    </section>
  );
};
