/**
 * Puerta del dashboard.
 *
 * Dos vías: cuenta con rol de administrador (lo recomendado, queda registro de
 * quién entró) o clave maestra, que sirve para el primer arranque. Cuál está
 * habilitada lo decide el backend; acá se ofrecen las dos y el que no
 * corresponda simplemente no valida.
 */

import { useState } from 'react';
import { KeyRound, ShieldCheck } from 'lucide-react';
import { entrarAlPanel, type AdminSession } from './api.ts';
import './admin.css';

interface Props {
  readonly onEntrar: (session: AdminSession) => void;
}

export const AdminLogin = ({ onEntrar }: Props): JSX.Element => {
  const [modo, setModo] = useState<'cuenta' | 'maestra'>('cuenta');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [maestra, setMaestra] = useState('');
  const [error, setError] = useState('');
  const [entrando, setEntrando] = useState(false);

  const enviar = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setEntrando(true);
    setError('');
    try {
      const session = await entrarAlPanel(
        modo === 'cuenta' ? { identifier, password } : { masterPassword: maestra },
      );
      onEntrar(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo abrir el panel.');
    } finally {
      setEntrando(false);
    }
  };

  return (
    <div className="admin admin--login">
      <form className="admin-login" onSubmit={(e) => void enviar(e)}>
        <h1>Esquel 2027</h1>
        <p className="admin-login__sub">Dashboard de Campaña</p>

        <div className="admin__switch" role="group" aria-label="Cómo entrar">
          <button type="button" className={modo === 'cuenta' ? 'is-active' : ''} onClick={() => setModo('cuenta')}>
            <ShieldCheck size={13} strokeWidth={2.5} aria-hidden /> Con mi cuenta
          </button>
          <button type="button" className={modo === 'maestra' ? 'is-active' : ''} onClick={() => setModo('maestra')}>
            <KeyRound size={13} strokeWidth={2.5} aria-hidden /> Clave maestra
          </button>
        </div>

        {modo === 'cuenta' ? (
          <>
            <label className="admin-field">
              <span>Alias o email</span>
              <input value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" autoFocus />
            </label>
            <label className="admin-field">
              <span>Contraseña</span>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            </label>
          </>
        ) : (
          <label className="admin-field">
            <span>Clave maestra</span>
            <input type="password" value={maestra} onChange={(e) => setMaestra(e.target.value)} autoComplete="off" autoFocus />
          </label>
        )}

        {error ? <p className="admin__error">{error}</p> : null}

        <button type="submit" className="admin-btn" disabled={entrando}>
          {entrando ? 'Abriendo…' : 'Entrar'}
        </button>

        <p className="admin-login__nota">
          El panel muestra datos agregados con k-anonimato. No hay forma de ver a un jugador en particular, ni desde acá
          ni desde ningún otro lado.
        </p>
      </form>
    </div>
  );
};
