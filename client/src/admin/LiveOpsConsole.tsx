/**
 * Consola de Live-Ops.
 *
 * Desde acá se agita el pueblo: se tira una noticia bomba o se fuerza cualquiera
 * de las diez tipologías de misión en el barrio que se quiera. Va derecho al
 * VPS, que la ejecuta por el mismo camino que una noticia real — no hay una vía
 * especial de administrador que produzca misiones distintas.
 *
 * Todo lo que se dispara queda en el registro de la derecha con la hora y lo que
 * contestó el servidor. Si algo no entró (cupo lleno, shard caído), lo dice.
 */

import { useState } from 'react';
import { Megaphone, Newspaper, Send, XCircle } from 'lucide-react';
import {
  BARRIO_DEFS,
  QUEST_LABELS,
  QUEST_TYPES,
  clampUnit,
  type Barrio,
  type LiveOpsResult,
  type QuestType,
} from '@esquel/shared';
import { dispararLiveOps, type AdminSession } from './api.ts';

interface Props {
  readonly session: AdminSession;
}

interface Linea {
  readonly at: string;
  readonly ok: boolean;
  readonly text: string;
}

const TOPICOS = ['obras', 'agua', 'nieve', 'seguridad', 'presupuesto', 'turismo', 'transporte'] as const;

export const LiveOpsConsole = ({ session }: Props): JSX.Element => {
  const [registro, setRegistro] = useState<readonly Linea[]>([]);
  const [enviando, setEnviando] = useState(false);

  // Noticia bomba
  const [titular, setTitular] = useState('');
  const [cuerpo, setCuerpo] = useState('');
  const [topico, setTopico] = useState<string>('obras');
  const [sentimiento, setSentimiento] = useState(-0.5);
  const [relevancia, setRelevancia] = useState(0.7);
  const [barrioNoticia, setBarrioNoticia] = useState<Barrio | ''>('');

  // Misión forzada
  const [tipo, setTipo] = useState<QuestType>('PEGATINA_RELAMPAGO');
  const [barrioMision, setBarrioMision] = useState<Barrio | ''>('');
  const [dificultad, setDificultad] = useState(0.5);

  const anotar = (resultados: readonly LiveOpsResult[]): void => {
    setRegistro((r) =>
      [
        ...resultados.map((res) => ({ at: new Date(res.at).toLocaleTimeString('es-AR'), ok: res.ok, text: res.text })),
        ...r,
      ].slice(0, 40),
    );
  };

  const fallar = (mensaje: string): void => {
    setRegistro((r) => [{ at: new Date().toLocaleTimeString('es-AR'), ok: false, text: mensaje }, ...r].slice(0, 40));
  };

  const tirarNoticia = async (): Promise<void> => {
    if (titular.trim().length < 8) {
      fallar('El titular es muy corto: nadie se cree una noticia de tres palabras.');
      return;
    }
    setEnviando(true);
    try {
      anotar(
        await dispararLiveOps(session, {
          kind: 'NOTICIA_BOMBA',
          news: {
            headline: titular.trim(),
            body: cuerpo.trim() || titular.trim(),
            sentiment: sentimiento,
            salience: clampUnit(relevancia),
            topic: topico,
            ...(barrioNoticia ? { barrio: barrioNoticia } : {}),
          },
        }),
      );
      setTitular('');
      setCuerpo('');
    } catch (err) {
      fallar(err instanceof Error ? err.message : 'No se pudo disparar la noticia.');
    } finally {
      setEnviando(false);
    }
  };

  const forzarMision = async (): Promise<void> => {
    setEnviando(true);
    try {
      anotar(
        await dispararLiveOps(session, {
          kind: 'SPAWN_QUEST',
          questType: tipo,
          ...(barrioMision ? { barrio: barrioMision } : {}),
          difficulty: clampUnit(dificultad),
        }),
      );
    } catch (err) {
      fallar(err instanceof Error ? err.message : 'No se pudo armar la misión.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <section className="admin-liveops">
      <div className="admin-liveops__panels">
        <article className="admin-card">
          <h3>
            <Newspaper size={14} strokeWidth={2.5} aria-hidden /> Noticia bomba
          </h3>
          <p className="admin-card__hint">
            Sale por el chat del shard y se ofrece al catálogo de misiones. Si el sentimiento es bien negativo, arma una
            operación de desmentida; si no, una conferencia de prensa.
          </p>

          <label className="admin-field">
            <span>Titular</span>
            <input value={titular} onChange={(e) => setTitular(e.target.value)} maxLength={120} placeholder="Se cayó la licitación del asfalto" />
          </label>

          <label className="admin-field">
            <span>Bajada</span>
            <textarea value={cuerpo} onChange={(e) => setCuerpo(e.target.value)} maxLength={280} rows={2} placeholder="Dos oferentes, el mismo domicilio." />
          </label>

          <div className="admin-field-row">
            <label className="admin-field">
              <span>Tema</span>
              <select value={topico} onChange={(e) => setTopico(e.target.value)}>
                {TOPICOS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="admin-field">
              <span>Barrio</span>
              <select value={barrioNoticia} onChange={(e) => setBarrioNoticia(e.target.value as Barrio | '')}>
                <option value="">todo el shard</option>
                {BARRIO_DEFS.filter((b) => b.id !== 'otro').map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="admin-field">
            <span>
              Sentimiento <strong>{sentimiento.toFixed(2)}</strong> {sentimiento < -0.3 ? '· escándalo' : sentimiento > 0.3 ? '· buena nueva' : '· tibia'}
            </span>
            <input type="range" min={-1} max={1} step={0.05} value={sentimiento} onChange={(e) => setSentimiento(Number(e.target.value))} />
          </label>

          <label className="admin-field">
            <span>
              Relevancia <strong>{relevancia.toFixed(2)}</strong>
            </span>
            <input type="range" min={0} max={1} step={0.05} value={relevancia} onChange={(e) => setRelevancia(Number(e.target.value))} />
          </label>

          <button type="button" className="admin-btn admin-btn--rojo" onClick={() => void tirarNoticia()} disabled={enviando}>
            <Send size={13} strokeWidth={2.5} aria-hidden /> Tirar la bomba
          </button>
        </article>

        <article className="admin-card">
          <h3>
            <Megaphone size={14} strokeWidth={2.5} aria-hidden /> Forzar una misión
          </h3>
          <p className="admin-card__hint">
            Las mismas diez tipologías que salen solas, pero cuando vos querés. Nace con el blueprint de siempre: mismos
            objetivos, mismas recompensas.
          </p>

          <label className="admin-field">
            <span>Tipología</span>
            <select value={tipo} onChange={(e) => setTipo(e.target.value as QuestType)}>
              {QUEST_TYPES.map((t) => (
                <option key={t} value={t}>
                  {QUEST_LABELS[t]}
                </option>
              ))}
            </select>
          </label>

          <label className="admin-field">
            <span>Barrio</span>
            <select value={barrioMision} onChange={(e) => setBarrioMision(e.target.value as Barrio | '')}>
              <option value="">el que decida el catálogo</option>
              {BARRIO_DEFS.filter((b) => b.id !== 'otro').map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>

          <label className="admin-field">
            <span>
              Dificultad <strong>{dificultad.toFixed(2)}</strong>
            </span>
            <input type="range" min={0} max={1} step={0.05} value={dificultad} onChange={(e) => setDificultad(Number(e.target.value))} />
          </label>

          <button type="button" className="admin-btn" onClick={() => void forzarMision()} disabled={enviando}>
            <Send size={13} strokeWidth={2.5} aria-hidden /> Armarla ahora
          </button>
        </article>
      </div>

      <article className="admin-card admin-card--log">
        <h3>Lo que se disparó</h3>
        {registro.length === 0 ? (
          <p className="admin-card__hint">Todavía no tiraste nada.</p>
        ) : (
          <ul className="admin-log">
            {registro.map((linea, i) => (
              <li key={`${linea.at}-${i}`} className={linea.ok ? '' : 'is-error'}>
                {linea.ok ? null : <XCircle size={11} strokeWidth={2.5} aria-hidden />}
                <time>{linea.at}</time> {linea.text}
              </li>
            ))}
          </ul>
        )}
      </article>
    </section>
  );
};
