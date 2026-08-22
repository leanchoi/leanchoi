/**
 * Raíz de la aplicación: canvas 3D + overlay del HUD.
 *
 * Parámetros de URL útiles para QA y capturas:
 *   ?hora=18      fuerza las 18:00 hora de Esquel (atardecer patagónico)
 *   ?spawn=-60,0  aparece en esa coordenada de mundo (x,z)
 *   ?hud=0        oculta el HUD
 *   ?dpr=1        fija el pixel ratio (comparar rendimiento entre equipos)
 *   ?token=…      entra con un JWT ya emitido (QA y pruebas automáticas)
 *   ?offline=1    salta el onboarding y juega sin servidor
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { NoToneMapping } from 'three';
import { CONFIG } from './config.ts';
import { CityScene } from './scene/CityScene.tsx';
import { PlayerHUD } from './ui/PlayerHUD.tsx';
import { OnboardingGate } from './ui/OnboardingGate.tsx';
import { useInputState } from './player/useKeyboard.ts';
import { sesionGuardada, type Sesion } from './net/session.ts';
import { useGameStore } from './state/gameStore.ts';

interface UrlParams {
  readonly forcedHour: number | null;
  readonly hud: boolean;
  readonly dpr: number | null;
  readonly spawn: { x: number; z: number } | null;
}

const readParams = (): UrlParams => {
  if (typeof window === 'undefined') return { forcedHour: null, hud: true, dpr: null, spawn: null };
  const params = new URLSearchParams(window.location.search);
  const hora = params.get('hora');
  const dpr = params.get('dpr');
  const spawnRaw = params.get('spawn');
  const parsedHour = hora === null ? Number.NaN : Number(hora);
  const parsedDpr = dpr === null ? Number.NaN : Number(dpr);
  let spawn: { x: number; z: number } | null = null;
  if (spawnRaw) {
    const [x, z] = spawnRaw.split(',').map(Number);
    if (Number.isFinite(x) && Number.isFinite(z)) spawn = { x, z };
  }
  return {
    forcedHour: Number.isFinite(parsedHour) ? Math.max(0, Math.min(24, parsedHour)) : null,
    hud: params.get('hud') !== '0',
    dpr: Number.isFinite(parsedDpr) ? parsedDpr : null,
    spawn,
  };
};

export const App = (): JSX.Element => {
  const containerRef = useRef<HTMLDivElement>(null);
  const input = useInputState(containerRef.current);
  const params = useMemo(readParams, []);
  const maxDpr = params.dpr ?? CONFIG.render.maxPixelRatio;

  // Sesión con Hostinger: si hay una guardada (o un ?token=), se entra derecho.
  const [sesion, setSesion] = useState<Sesion | null>(() => sesionGuardada());
  const offline = useMemo(
    () => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('offline') === '1',
    [],
  );
  const setAccessToken = useGameStore((s) => s.setAccessToken);

  useEffect(() => {
    if (sesion) setAccessToken(sesion.accessToken);
  }, [sesion, setAccessToken]);

  const mostrarOnboarding = !sesion && !offline;

  return (
    <div
      ref={containerRef}
      style={{ position: 'absolute', inset: 0, background: '#0b0e14', touchAction: 'none' }}
    >
      <Canvas
        // Sin antialias: la estética es de bloque y el filo se agradece en móvil.
        gl={{ antialias: false, powerPreference: 'high-performance', stencil: false, alpha: false }}
        dpr={[1, maxDpr]}
        camera={{ fov: 55, near: 0.5, far: 6000, position: [0, 18, -60] }}
        onCreated={({ gl }) => {
          // Sin tone mapping: los colores planos del voxel art se ven mejor
          // directos, y el HUD pixel-art conserva el contraste.
          gl.toneMapping = NoToneMapping;
        }}
        frameloop="always"
      >
        <CityScene input={input} forcedHour={params.forcedHour} spawn={params.spawn} session={sesion} />
      </Canvas>

      {params.hud ? <PlayerHUD /> : null}
      {mostrarOnboarding ? <OnboardingGate onListo={setSesion} /> : null}
    </div>
  );
};

export default App;
