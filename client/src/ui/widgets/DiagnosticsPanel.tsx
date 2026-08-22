/**
 * Panel de diagnóstico (tecla F3).
 *
 * Es la herramienta de trabajo del motor: si los FPS caen, acá se ve si fue por
 * cantidad de instancias, por chunks pendientes de construir o por colisiones.
 */

import { useGameStore } from '../../state/gameStore.ts';

export const DiagnosticsPanel = (): JSX.Element | null => {
  const visible = useGameStore((s) => s.showDiagnostics);
  const d = useGameStore((s) => s.diagnostics);
  const p = useGameStore((s) => s.player);
  const clock = useGameStore((s) => s.clock);
  if (!visible) return null;

  return (
    <div className="hud-panel diagnostics" aria-label="Diagnóstico del motor">
      <div>
        <b>{d.fps} FPS</b> · {d.chunks} chunks ({d.pending} en cola)
      </div>
      <div>
        instancias <b>{d.instances.toLocaleString('es-AR')}</b> · colliders {d.colliders}
      </div>
      <div>
        fachadas reales <b>{d.prefabs}</b>
      </div>
      <div>
        pos <b>{p.position.x.toFixed(1)}</b>, <b>{p.position.z.toFixed(1)}</b>
      </div>
      <div>
        sol {clock.elevationDeg}° · {clock.phase}
      </div>
      <div style={{ marginTop: 4 }}>WASD mover · Shift correr · C cámara · F3 cerrar</div>
    </div>
  );
};
