// SURIA — Centro de Operaciones Global
// Página principal del dashboard: gate de contraseña, header glassmórfico y
// pestañas "Aplicaciones" (centro de control) y "Cerebro RAG" (grafo 2D).
//
// Si ya tenés un pages/dashboard.js con otras pestañas, alcanza con:
//   import ControlCenter from '../components/ControlCenter';
//   import RagGraph from '../components/RagGraph';
// agregar dos entradas a tu tab bar y renderizar <ControlCenter/> / <RagGraph/>.
// (Los estilos globales .glass / variables de este archivo también hacen falta.)
import Head from 'next/head';
import { useEffect, useRef, useState } from 'react';
import ControlCenter from '../components/ControlCenter';
import RagGraph from '../components/RagGraph';

const PASS = process.env.NEXT_PUBLIC_DASHBOARD_PASS || 'suria123';
const AUTH_KEY = 'suria_portal_auth';

const TABS = [
  { id: 'apps', icon: '🛰️', label: 'Aplicaciones' },
  { id: 'cerebro', icon: '🧠', label: 'Cerebro RAG' },
];

function Gate({ onUnlock }) {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState(false);
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current && inputRef.current.focus(); }, []);
  const submit = (e) => {
    e.preventDefault();
    if (pw === PASS) onUnlock();
    else { setErr(true); setPw(''); setTimeout(() => setErr(false), 700); }
  };
  return (
    <div className="gate">
      <form className={`glass gatecard ${err ? 'shake' : ''}`} onSubmit={submit}>
        <div className="orb">💠</div>
        <h1>SURIA</h1>
        <p>Centro de Operaciones Global</p>
        <input ref={inputRef} type="password" placeholder="contraseña" value={pw} onChange={(e) => setPw(e.target.value)} aria-label="contraseña" />
        <button type="submit">Entrar</button>
        {err && <span className="gerr">contraseña incorrecta</span>}
      </form>
      <style jsx>{`
        .gate { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
        .gatecard { width: 320px; padding: 38px 32px; display: flex; flex-direction: column; align-items: center; gap: 12px; text-align: center; }
        .orb { font-size: 42px; filter: drop-shadow(0 0 18px rgba(139, 92, 246, 0.7)); animation: float 4s ease-in-out infinite; }
        @keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-7px); } }
        h1 { margin: 0; font-size: 30px; letter-spacing: 0.32em; padding-left: 0.32em; background: linear-gradient(120deg, #c4b5fd, #67e8f9); -webkit-background-clip: text; background-clip: text; color: transparent; }
        p { margin: 0 0 8px; font-size: 12px; color: var(--muted); letter-spacing: 0.08em; }
        input { width: 100%; text-align: center; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 10px; color: var(--text); font-size: 14px; padding: 11px; outline: none; }
        input:focus { border-color: rgba(139, 92, 246, 0.6); box-shadow: 0 0 0 4px rgba(139, 92, 246, 0.14); }
        button { width: 100%; background: linear-gradient(135deg, #7c3aed, #4f46e5); color: #fff; border: none; border-radius: 10px; padding: 11px; font-size: 13.5px; font-weight: 700; cursor: pointer; box-shadow: 0 10px 28px -10px rgba(124, 58, 237, 0.7); }
        button:hover { filter: brightness(1.12); }
        .gerr { font-size: 11.5px; color: #fb7185; }
        .shake { animation: shake 0.45s ease; }
        @keyframes shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-9px); } 50% { transform: translateX(7px); } 75% { transform: translateX(-4px); } }
      `}</style>
    </div>
  );
}

export default function Dashboard() {
  const [checked, setChecked] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [tab, setTab] = useState('apps');
  const [visited, setVisited] = useState({ apps: true });
  const [clock, setClock] = useState('');

  useEffect(() => {
    setAuthed(sessionStorage.getItem(AUTH_KEY) === '1');
    setChecked(true);
    const h = window.location.hash.replace('#', '');
    if (TABS.some((t) => t.id === h)) { setTab(h); setVisited((v) => ({ ...v, [h]: true })); }
    const tick = () => setClock(new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }));
    tick();
    const iv = setInterval(tick, 20000);
    return () => clearInterval(iv);
  }, []);

  const unlock = () => { sessionStorage.setItem(AUTH_KEY, '1'); setAuthed(true); };
  const switchTab = (id) => {
    setTab(id);
    setVisited((v) => ({ ...v, [id]: true }));
    if (typeof window !== 'undefined') window.history.replaceState(null, '', `#${id}`);
  };

  return (
    <>
      <Head>
        <title>SURIA · Centro de Operaciones</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <style jsx global>{`
        :root {
          --text: #e8e8f2;
          --muted: #9b9bb0;
          --bg: #07070d;
        }
        * { box-sizing: border-box; }
        html, body { margin: 0; padding: 0; }
        body {
          background: var(--bg);
          background-image:
            radial-gradient(900px 520px at 12% -8%, rgba(124, 58, 237, 0.16), transparent 60%),
            radial-gradient(800px 500px at 105% 12%, rgba(14, 165, 233, 0.11), transparent 55%),
            radial-gradient(700px 700px at 50% 115%, rgba(5, 150, 105, 0.07), transparent 60%);
          background-attachment: fixed;
          color: var(--text);
          font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
          -webkit-font-smoothing: antialiased;
        }
        ::selection { background: rgba(139, 92, 246, 0.45); }
        ::-webkit-scrollbar { width: 9px; height: 9px; }
        ::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.13); border-radius: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        .glass {
          background: rgba(13, 13, 22, 0.55);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 16px;
          backdrop-filter: blur(18px) saturate(140%);
          -webkit-backdrop-filter: blur(18px) saturate(140%);
          box-shadow: 0 10px 34px -16px rgba(0, 0, 0, 0.65);
        }
        button, input, select, textarea { font-family: inherit; }
      `}</style>

      {!checked ? null : !authed ? (
        <Gate onUnlock={unlock} />
      ) : (
        <div className="shell">
          <header className="topbar">
            <div className="brand">
              <span className="orb">💠</span>
              <div>
                <div className="bname">SURIA</div>
                <div className="bsub">Centro de Operaciones Global</div>
              </div>
            </div>
            <nav className="tabs" aria-label="secciones">
              {TABS.map((t) => (
                <button key={t.id} className={`tabbtn ${tab === t.id ? 'active' : ''}`} onClick={() => switchTab(t.id)}>
                  <span className="tico">{t.icon}</span>{t.label}
                </button>
              ))}
            </nav>
            <div className="right">
              <span className="clock">{clock}</span>
            </div>
          </header>

          <main className="content">
            {visited.apps && (
              <div style={{ display: tab === 'apps' ? 'block' : 'none' }}><ControlCenter /></div>
            )}
            {visited.cerebro && (
              <div style={{ display: tab === 'cerebro' ? 'block' : 'none' }}><RagGraph /></div>
            )}
          </main>

          <footer className="foot">SURIA · VPS 187.77.224.159 · dashboard.colabtur.org</footer>
        </div>
      )}

      <style jsx>{`
        .shell { min-height: 100vh; display: flex; flex-direction: column; }
        .topbar {
          position: sticky; top: 0; z-index: 50;
          display: flex; align-items: center; gap: 22px;
          padding: 12px 22px;
          background: rgba(10, 10, 15, 0.85);
          backdrop-filter: blur(20px) saturate(150%);
          -webkit-backdrop-filter: blur(20px) saturate(150%);
          border-bottom: 1px solid rgba(255, 255, 255, 0.07);
        }
        .brand { display: flex; align-items: center; gap: 11px; }
        .orb { font-size: 24px; filter: drop-shadow(0 0 12px rgba(139, 92, 246, 0.65)); }
        .bname { font-size: 17px; font-weight: 800; letter-spacing: 0.26em; background: linear-gradient(120deg, #c4b5fd, #67e8f9); -webkit-background-clip: text; background-clip: text; color: transparent; line-height: 1.1; }
        .bsub { font-size: 10px; color: var(--muted); letter-spacing: 0.06em; }
        .tabs { display: flex; gap: 6px; flex: 1; justify-content: center; }
        .tabbtn {
          position: relative; display: inline-flex; align-items: center; gap: 7px;
          background: none; border: 1px solid transparent; border-radius: 10px;
          color: var(--muted); font-size: 13px; font-weight: 600; padding: 8px 15px; cursor: pointer;
          transition: color 0.18s ease, background 0.18s ease;
        }
        .tabbtn:hover { color: var(--text); background: rgba(255, 255, 255, 0.05); }
        .tabbtn.active { color: var(--text); background: rgba(139, 92, 246, 0.13); border-color: rgba(139, 92, 246, 0.35); box-shadow: 0 0 18px -6px rgba(139, 92, 246, 0.55); }
        .tabbtn.active::after { content: ''; position: absolute; left: 18%; right: 18%; bottom: -13px; height: 2px; border-radius: 2px; background: linear-gradient(90deg, transparent, #a78bfa, transparent); }
        .tico { font-size: 15px; }
        .right { min-width: 60px; text-align: right; }
        .clock { font-size: 13px; color: var(--muted); font-variant-numeric: tabular-nums; }
        .content { flex: 1; width: 100%; max-width: 1420px; margin: 0 auto; padding: 24px 22px 40px; }
        .foot { text-align: center; font-size: 10.5px; color: rgba(155, 155, 176, 0.55); padding: 14px; letter-spacing: 0.05em; }
        @media (max-width: 720px) {
          .topbar { flex-wrap: wrap; gap: 10px; }
          .tabs { order: 3; width: 100%; justify-content: flex-start; }
          .right { display: none; }
          .content { padding: 16px 12px 32px; }
        }
      `}</style>
    </>
  );
}
