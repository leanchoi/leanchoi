/**
 * Validación de movimiento: anti-cheat básico y honesto.
 *
 * No pretende ser infalible —ninguna validación de cliente lo es— pero corta de
 * raíz lo que se hace con la consola abierta: teletransportarse a la otra punta,
 * caminar a 40 m/s para llegar primero a la esquina en disputa, o salirse del
 * área jugable.
 *
 * La política es "corregir, no expulsar": el servidor manda un `s2c.reconcile`
 * con la última posición válida. Recién si alguien insiste (`strikes`) se lo saca.
 */

import { MOVEMENT, WORLD_ANCHOR, CELL_PITCH_M } from '@esquel/shared';

export interface MovementSample {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Momento del servidor en ms. */
  readonly at: number;
}

export type MovementVerdict =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'velocidad' | 'teleport' | 'limites' | 'altura'; readonly detail: string };

/** Margen sobre la velocidad máxima: lag y saltos generan picos legítimos. */
const SPEED_TOLERANCE = 1.6;
/** Salto de posición que ningún input legítimo produce, en metros. */
const TELEPORT_M = 24;

const bounds = (() => {
  const [minCol, minRow, maxCol, maxRow] = WORLD_ANCHOR.bounds;
  const half = CELL_PITCH_M / 2;
  return {
    minX: minCol * CELL_PITCH_M - half,
    maxX: maxCol * CELL_PITCH_M + half,
    minZ: minRow * CELL_PITCH_M - half,
    maxZ: maxRow * CELL_PITCH_M + half,
  };
})();

export class MovementValidator {
  private strikes = 0;

  /** Cuántas correcciones acumuladas lleva este jugador. */
  get strikeCount(): number {
    return this.strikes;
  }

  /** `true` cuando ya se pasó de la raya y conviene desconectarlo. */
  get shouldKick(): boolean {
    return this.strikes >= 12;
  }

  /** Perdona de a poco: quien juega limpio vuelve a cero. */
  forgive(): void {
    if (this.strikes > 0) this.strikes--;
  }

  validate(previous: MovementSample, next: MovementSample): MovementVerdict {
    if (
      !Number.isFinite(next.x) ||
      !Number.isFinite(next.y) ||
      !Number.isFinite(next.z)
    ) {
      this.strikes += 3;
      return { ok: false, reason: 'limites', detail: 'Coordenadas no finitas.' };
    }

    if (next.x < bounds.minX || next.x > bounds.maxX || next.z < bounds.minZ || next.z > bounds.maxZ) {
      this.strikes++;
      return { ok: false, reason: 'limites', detail: `Fuera del área jugable (${next.x.toFixed(1)}, ${next.z.toFixed(1)}).` };
    }

    // Nadie anda por arriba de los techos ni por debajo del asfalto.
    if (next.y < -2 || next.y > 40) {
      this.strikes++;
      return { ok: false, reason: 'altura', detail: `y=${next.y.toFixed(2)} fuera de rango.` };
    }

    const distance = Math.hypot(next.x - previous.x, next.z - previous.z);

    if (distance > TELEPORT_M) {
      this.strikes += 2;
      return { ok: false, reason: 'teleport', detail: `Salto de ${distance.toFixed(1)} m en un solo paquete.` };
    }

    const dt = Math.max(0.016, (next.at - previous.at) / 1000);
    const speed = distance / dt;
    const limit = MOVEMENT.MAX_PLAUSIBLE_SPEED * SPEED_TOLERANCE;

    if (speed > limit) {
      this.strikes++;
      return { ok: false, reason: 'velocidad', detail: `${speed.toFixed(1)} m/s (máximo ${limit.toFixed(1)}).` };
    }

    this.forgive();
    return { ok: true };
  }
}
