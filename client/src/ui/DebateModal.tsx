/**
 * Duelo de Chicanas — la mesa de cartas.
 *
 * Overlay arcade que se abre cuando dos militantes de bandos rivales se cruzan
 * y se arma. Muestra las dos barras de credibilidad, la labia disponible, la
 * mano del jugador y el registro de lo que se van diciendo.
 *
 * Las cartas que no se pueden jugar —sin labia, en cooldown o silenciadas— se
 * ven grises y explican por qué al pasar el mouse. Nada de "acción inválida":
 * si no podés, el juego te dice el motivo.
 */

import { useEffect, useMemo, useState } from 'react';
import { Clock, Flame, MessageSquareWarning, Zap } from 'lucide-react';
import {
  DEBATE,
  FAMILY_COLORS,
  FAMILY_LABELS,
  type DebateFamily,
  type DebateView,
} from '@esquel/shared';
import { networkClient } from '../net/NetworkClient.ts';
import { CARD_INDEX } from '../debate/cardIndex.ts';
import { useGameStore } from '../state/gameStore.ts';

const familyColor = (family: DebateFamily): string => FAMILY_COLORS[family] ?? '#f2b441';

/** Cartelito de convite: alguien te encaró y hay que decidir en el momento. */
const DebateInvite = ({ ahora }: { ahora: number }): JSX.Element | null => {
  const invite = useGameStore((s) => s.debateInvite);
  const setInvite = useGameStore((s) => s.setDebateInvite);
  if (!invite) return null;

  const segundos = Math.max(0, Math.ceil((invite.expiresAt - ahora) / 1000));
  if (segundos <= 0) return null;

  const responder = (acepta: boolean): void => {
    networkClient.respondDebate(invite.duelId, acepta);
    setInvite(null);
  };

  return (
    <div className="debate-invite" role="dialog" aria-label="Te desafiaron a un duelo">
      <p className="debate-invite__texto">
        <Flame size={13} strokeWidth={2.5} aria-hidden /> <strong>{invite.fromAlias}</strong> te encaró para discutir.
      </p>
      <p className="debate-invite__reloj">Se le acaba la paciencia en {segundos}s</p>
      <div className="debate-invite__acciones">
        <button type="button" className="debate__boton" onClick={() => responder(true)}>
          Bancármela
        </button>
        <button type="button" className="debate__boton debate__boton--rojo" onClick={() => responder(false)}>
          Otro día
        </button>
      </div>
    </div>
  );
};

export const DebateModal = (): JSX.Element | null => {
  const debate = useGameStore((s) => s.debate);
  const invite = useGameStore((s) => s.debateInvite);
  const [ahora, setAhora] = useState(() => Date.now());

  useEffect(() => {
    if (!debate && !invite) return;
    const id = window.setInterval(() => setAhora(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [debate, invite]);

  const vista = debate?.view as DebateView | undefined;
  const duel = vista?.duel;

  const yo = useMemo(() => (vista ? (vista.isChallenger ? duel?.challenger : duel?.defender) : undefined), [vista, duel]);
  const rival = useMemo(() => (vista ? (vista.isChallenger ? duel?.defender : duel?.challenger) : undefined), [vista, duel]);

  if (!debate || !duel || !yo || !rival) return invite ? <DebateInvite ahora={ahora} /> : null;

  const segundos = Math.max(0, Math.ceil((duel.turnEndsAt - ahora) / 1000));
  const miTurno = debate.isMyTurn;
  const mano = [...(yo.hand ?? [])] as string[];

  const motivoBloqueo = (slug: string): string => {
    const carta = CARD_INDEX.get(slug);
    if (!carta) return 'Carta desconocida';
    if (!miTurno) return 'No es tu turno';
    if (carta.cost > yo.labia) return `Necesitás ${carta.cost} de labia`;
    if ((yo.cooldowns as Record<string, number>)[slug] > 0) return 'Todavía está recargando';
    if (yo.statuses.some((st) => st.kind === 'silenciar' && st.family === carta.family))
      return `Te silenciaron ${FAMILY_LABELS[carta.family]}`;
    return '';
  };

  const jugar = (slug: string): void => {
    if (!miTurno || motivoBloqueo(slug)) return;
    networkClient.playDebateCard(duel.id, slug, duel.turn);
  };

  const barra = (valor: number, max: number): string => `${Math.max(0, Math.min(100, (valor / max) * 100))}%`;

  return (
    <div className="debate" role="dialog" aria-label="Duelo de chicanas">
      <div className="debate__panel">
        {/* Rival */}
        <header className="debate__lado debate__lado--rival">
          <div className="debate__nombre">
            {rival.nick}
            <span className="debate__rango">rango {rival.rankTier}</span>
            {rival.liedLastTurn ? <span className="debate__mentira">acaba de prometer</span> : null}
          </div>
          <div className="debate__cred">
            <span className="debate__cred-fill" style={{ width: barra(rival.credibility, rival.credibilityMax) }} />
            <span className="debate__cred-num">
              {rival.credibility}/{rival.credibilityMax}
            </span>
          </div>
          <div className="debate__meta">
            <Zap size={11} strokeWidth={2.5} /> {rival.labia} labia · {rival.handSize} cartas ·{' '}
            {Math.round(rival.crowdFavor * 100)}% del público
          </div>
        </header>

        {/* Centro: turno y registro */}
        <div className="debate__centro">
          <div className="debate__turno">
            <Clock size={12} strokeWidth={2.5} />
            Turno {duel.turn}/{duel.maxTurns} · {miTurno ? `te toca (${segundos}s)` : 'espera al rival'}
          </div>
          <div className="debate__log">
            {duel.log.slice(-5).map((entrada, i) => (
              <div key={`${entrada.turn}-${i}`} className="debate__log-line">
                <span style={{ color: entrada.family ? familyColor(entrada.family as DebateFamily) : '#9a927f' }}>
                  {entrada.family ? FAMILY_LABELS[entrada.family as DebateFamily] : 'Pasó'}
                </span>{' '}
                {entrada.text}
              </div>
            ))}
          </div>
        </div>

        {/* Jugador */}
        <section className="debate__lado debate__lado--yo">
          <div className="debate__cred">
            <span
              className="debate__cred-fill debate__cred-fill--yo"
              style={{ width: barra(yo.credibility, yo.credibilityMax) }}
            />
            <span className="debate__cred-num">
              {yo.credibility}/{yo.credibilityMax}
            </span>
          </div>
          <div className="debate__meta">
            <Zap size={11} strokeWidth={2.5} /> {yo.labia}/{yo.labiaMax} labia · retórica {yo.rhetoric}
            {yo.abilityBlocked ? ' · sin quórum' : ''}
          </div>
        </section>

        {/* Mano */}
        <div className="debate__mano">
          {mano.map((slug) => {
            const carta = CARD_INDEX.get(slug);
            if (!carta) return null;
            const bloqueo = motivoBloqueo(slug);
            return (
              <button
                key={slug}
                type="button"
                className={`carta${bloqueo ? ' carta--bloqueada' : ''}`}
                style={{ borderColor: familyColor(carta.family) }}
                onClick={() => jugar(slug)}
                title={bloqueo || carta.flavor}
                disabled={Boolean(bloqueo)}
              >
                <span className="carta__familia" style={{ background: familyColor(carta.family) }}>
                  {FAMILY_LABELS[carta.family]}
                </span>
                <span className="carta__nombre">{carta.name}</span>
                <span className="carta__stats">
                  <Flame size={10} strokeWidth={2.5} /> {carta.power}
                  <Zap size={10} strokeWidth={2.5} /> {carta.cost}
                </span>
                <span className="carta__flavor">{carta.flavor}</span>
                {bloqueo ? <span className="carta__bloqueo">{bloqueo}</span> : null}
              </button>
            );
          })}
        </div>

        <footer className="debate__acciones">
          <button
            type="button"
            className="debate__boton"
            disabled={!miTurno}
            onClick={() => networkClient.passDebate(duel.id)}
            title={`Recuperás ${DEBATE.LABIA_PASS_BONUS} de labia`}
          >
            Tomar aire (+{DEBATE.LABIA_PASS_BONUS} labia)
          </button>
          <button
            type="button"
            className="debate__boton debate__boton--rojo"
            onClick={() => networkClient.forfeitDebate(duel.id)}
          >
            <MessageSquareWarning size={12} strokeWidth={2.5} /> Rajar
          </button>
        </footer>
      </div>
    </div>
  );
};
