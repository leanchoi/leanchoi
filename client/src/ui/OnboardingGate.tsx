/**
 * Onboarding de treinta segundos.
 *
 * Alias, contraseña y cuatro cosas más: edad, barrio, bando y cuánto te interesa
 * la política. Nada de confirmar el mail, ni captcha, ni cinco pantallas de
 * bienvenida. El que quiere jugar, juega.
 *
 * Los datos demográficos no son un formulario de trámite: son la materia prima
 * del motor de inteligencia, y por eso se piden acá y una sola vez.
 */

import { useState, type FormEvent } from 'react';
import { BARRIO_DEFS, FACTIONS } from '@esquel/shared';
import { ApiError, entrar, registrar, type Sesion } from '../net/session.ts';

export interface OnboardingGateProps {
  readonly onListo: (sesion: Sesion) => void;
}

const GENEROS = [
  { id: 'femenino', label: 'Femenino' },
  { id: 'masculino', label: 'Masculino' },
  { id: 'no_binario', label: 'No binario' },
  { id: 'prefiere_no_decir', label: 'Prefiero no decir' },
];

const INTERESES = [
  { id: 'nulo', label: 'Cero, vine por el paisaje' },
  { id: 'bajo', label: 'Poco' },
  { id: 'medio', label: 'Lo normal' },
  { id: 'alto', label: 'Bastante' },
  { id: 'militante', label: 'Milito desde los 15' },
];

export const OnboardingGate = ({ onListo }: OnboardingGateProps): JSX.Element => {
  const [modo, setModo] = useState<'registro' | 'ingreso'>('registro');
  const [alias, setAlias] = useState('');
  const [password, setPassword] = useState('');
  const [edad, setEdad] = useState('30');
  const [genero, setGenero] = useState('prefiere_no_decir');
  const [barrio, setBarrio] = useState('centro');
  const [faccionId, setFaccionId] = useState('0');
  const [interes, setInteres] = useState('medio');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  const enviar = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setError('');
    setEnviando(true);
    try {
      const sesion =
        modo === 'registro'
          ? await registrar({
              alias: alias.trim(),
              password,
              edad: Number(edad),
              genero,
              barrio,
              faccionId: Number(faccionId),
              interesPolitico: interes,
              telemetria: true,
            })
          : await entrar(alias.trim(), password);
      onListo(sesion);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError('No se pudo hablar con el servidor. ¿Está levantado el backend?');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="onboarding">
      <form className="onboarding__panel" onSubmit={(e) => void enviar(e)}>
        <h1 className="onboarding__title">ESQUEL 2027</h1>
        <p className="onboarding__sub">
          {modo === 'registro'
            ? 'Treinta segundos y estás caminando por Alvear. Elegí un alias, un bando y a militar.'
            : 'Volviste. Poné tu alias y tu contraseña.'}
        </p>

        <div className="onboarding__grid">
          <div className="onboarding__field onboarding__field--wide">
            <label htmlFor="alias">Alias</label>
            <input
              id="alias"
              value={alias}
              maxLength={24}
              autoComplete="username"
              placeholder="Beto el Puntero"
              onChange={(e) => setAlias(e.target.value)}
              required
            />
          </div>

          <div className="onboarding__field onboarding__field--wide">
            <label htmlFor="password">Contraseña</label>
            <input
              id="password"
              type="password"
              value={password}
              minLength={8}
              autoComplete={modo === 'registro' ? 'new-password' : 'current-password'}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {modo === 'registro' ? (
            <>
              <div className="onboarding__field">
                <label htmlFor="edad">Edad</label>
                <input
                  id="edad"
                  type="number"
                  min={13}
                  max={110}
                  value={edad}
                  onChange={(e) => setEdad(e.target.value)}
                  required
                />
              </div>

              <div className="onboarding__field">
                <label htmlFor="genero">Género</label>
                <select id="genero" value={genero} onChange={(e) => setGenero(e.target.value)}>
                  {GENEROS.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="onboarding__field">
                <label htmlFor="barrio">Barrio</label>
                <select id="barrio" value={barrio} onChange={(e) => setBarrio(e.target.value)}>
                  {BARRIO_DEFS.filter((b) => b.id !== 'otro').map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="onboarding__field">
                <label htmlFor="faccion">Bando</label>
                <select id="faccion" value={faccionId} onChange={(e) => setFaccionId(e.target.value)}>
                  <option value="0">Independiente (por ahora)</option>
                  {FACTIONS.map((f) => (
                    <option key={f.slug} value={String(f.id)}>
                      {f.name} ({f.shortName})
                    </option>
                  ))}
                </select>
              </div>

              <div className="onboarding__field onboarding__field--wide">
                <label htmlFor="interes">¿Cuánto te interesa la política?</label>
                <select id="interes" value={interes} onChange={(e) => setInteres(e.target.value)}>
                  {INTERESES.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.label}
                    </option>
                  ))}
                </select>
              </div>
            </>
          ) : null}
        </div>

        {error ? <div className="onboarding__error">{error}</div> : null}

        <div className="onboarding__acciones">
          <button type="submit" className="onboarding__boton" disabled={enviando}>
            {enviando ? 'Un toque…' : modo === 'registro' ? 'A la calle' : 'Entrar'}
          </button>
          <button
            type="button"
            className="onboarding__boton onboarding__boton--fantasma"
            onClick={() => {
              setModo(modo === 'registro' ? 'ingreso' : 'registro');
              setError('');
            }}
            disabled={enviando}
          >
            {modo === 'registro' ? 'Ya tengo cuenta' : 'Soy nuevo'}
          </button>
        </div>
      </form>
    </div>
  );
};
