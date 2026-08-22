/**
 * Modo Candidato — la campaña de un solo jugador.
 *
 * Doce dilemas, cuatro variables y ningún atajo limpio: cada decisión te sube
 * una barra y te baja otra. Se juega de una sentada, sin servidor de por medio;
 * al final se manda el resultado por red y el servidor decide cuánto de esa
 * gloria se convierte en XP, reputación y guita del personaje del MMO.
 *
 * La barra de escándalo es la que hay que mirar: pasa de 92 y no hay elección
 * que valga, te comés el carpetazo y se acabó la campaña.
 */

import { useMemo, useState } from 'react';
import { Briefcase, Flame, Handshake, Smile, X } from 'lucide-react';
import { networkClient } from '../net/NetworkClient.ts';
import {
  ARCHETYPES,
  CAMPAIGN_TURNS,
  CandidateCampaign,
  type ArchetypeId,
  type CampaignSnapshot,
} from '../modes/CandidateCampaign.ts';

interface Props {
  readonly onClose: () => void;
}

const VARIABLES = [
  { key: 'cajaCampana', label: 'Caja', Icon: Briefcase, color: 'var(--hud-border)' },
  { key: 'roscaPolitica', label: 'Rosca', Icon: Handshake, color: 'var(--hud-purple)' },
  { key: 'imagenPublica', label: 'Imagen', Icon: Smile, color: 'var(--hud-blue)' },
  { key: 'nivelEscandalo', label: 'Escándalo', Icon: Flame, color: 'var(--hud-red)' },
] as const;

export const CampaignModal = ({ onClose }: Props): JSX.Element => {
  const [campana, setCampana] = useState<CandidateCampaign | null>(null);
  const [snapshot, setSnapshot] = useState<CampaignSnapshot | null>(null);
  const [ultimo, setUltimo] = useState<string>('');
  const [liquidada, setLiquidada] = useState(false);

  const turno = useMemo(() => campana?.current() ?? null, [campana, snapshot]);

  const arrancar = (id: ArchetypeId): void => {
    const nueva = new CandidateCampaign(id);
    setCampana(nueva);
    setSnapshot(nueva.snapshot());
    setUltimo('');
    setLiquidada(false);
  };

  const elegir = (optionId: string): void => {
    if (!campana) return;
    const res = campana.choose(optionId);
    if (!res.ok) {
      setUltimo(res.error);
      return;
    }
    setUltimo(res.outcome);
    setSnapshot(res.snapshot);
  };

  const liquidar = (): void => {
    if (!campana || liquidada) return;
    networkClient.settleCampaign(campana.result());
    setLiquidada(true);
  };

  /* --- selección de arquetipo ------------------------------------------- */
  if (!campana || !snapshot) {
    return (
      <div className="campaign" role="dialog" aria-label="Modo Candidato">
        <div className="campaign__panel">
          <header className="campaign__head">
            <h2>Modo Candidato</h2>
            <button type="button" className="campaign__cerrar" onClick={onClose} aria-label="Cerrar">
              <X size={14} strokeWidth={3} />
            </button>
          </header>
          <p className="campaign__intro">
            Doce decisiones hasta el comicio. Elegí con qué mochila arrancás: ninguna es cómoda.
          </p>
          <div className="campaign__arquetipos">
            {ARCHETYPES.map((a) => (
              <button key={a.id} type="button" className="arquetipo" onClick={() => arrancar(a.id)}>
                <span className="arquetipo__nombre">{a.name}</span>
                <span className="arquetipo__tag">{a.tagline}</span>
                <span className="arquetipo__desc">{a.description}</span>
                <span className="arquetipo__stats">
                  Caja {a.start.cajaCampana} · Rosca {a.start.roscaPolitica} · Imagen {a.start.imagenPublica} ·
                  Escándalo {a.start.nivelEscandalo}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const stats = snapshot.stats as unknown as Record<string, number>;

  return (
    <div className="campaign" role="dialog" aria-label="Modo Candidato">
      <div className="campaign__panel">
        <header className="campaign__head">
          <h2>
            {campana.archetype.name}
            <small>
              Turno {Math.min(snapshot.turn + 1, CAMPAIGN_TURNS)}/{CAMPAIGN_TURNS}
            </small>
          </h2>
          <button type="button" className="campaign__cerrar" onClick={onClose} aria-label="Cerrar">
            <X size={14} strokeWidth={3} />
          </button>
        </header>

        <div className="campaign__vars">
          {VARIABLES.map(({ key, label, Icon, color }) => {
            const valor = Math.round(stats[key] ?? 0);
            return (
              <div key={key} className="campaign__var">
                <span className="campaign__var-label" style={{ color }}>
                  <Icon size={11} strokeWidth={2.5} aria-hidden /> {label}
                </span>
                <div className="campaign__var-bar">
                  <span style={{ width: `${Math.max(0, Math.min(100, valor))}%`, background: color }} />
                </div>
                <span className="campaign__var-num">{valor}</span>
              </div>
            );
          })}
        </div>

        {ultimo ? <p className="campaign__outcome">{ultimo}</p> : null}

        {snapshot.finished && snapshot.ending ? (
          <div className={`campaign__final${snapshot.ending.won ? ' is-win' : ''}`}>
            <h3>{snapshot.ending.title}</h3>
            <p>{snapshot.ending.text}</p>
            <div className="campaign__acciones">
              <button type="button" className="debate__boton" onClick={liquidar} disabled={liquidada}>
                {liquidada ? 'Liquidada' : 'Cobrar la campaña'}
              </button>
              <button type="button" className="debate__boton" onClick={() => arrancar(campana.archetype.id)}>
                Otra vuelta
              </button>
              <button type="button" className="debate__boton debate__boton--rojo" onClick={onClose}>
                Volver a la calle
              </button>
            </div>
          </div>
        ) : turno ? (
          <div className="campaign__dilema">
            <h3>{turno.dilemma.title}</h3>
            <p>{turno.dilemma.text}</p>
            <div className="campaign__opciones">
              {turno.options.map((op) => (
                <button key={op.id} type="button" className="campaign__opcion" onClick={() => elegir(op.id)}>
                  {op.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {snapshot.history.length > 0 ? (
          <ul className="campaign__historial">
            {snapshot.history.slice(-4).map((h, i) => (
              <li key={`${h.dilemma}-${i}`}>
                <strong>{h.option}</strong> — {h.outcome}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
};
