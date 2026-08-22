/**
 * Registro de salas vivas del proceso.
 *
 * El dashboard necesita preguntarle al shard cómo viene el pueblo *ahora* y
 * disparar Live-Ops sin esperar al próximo volcado a MySQL. Como el VPS corre en
 * modo fork —un proceso por puerto—, alcanza con que cada sala se anote acá al
 * crearse y se borre al cerrarse: el endpoint HTTP las recorre en memoria, sin
 * IPC ni `remoteRoomCall`.
 *
 * Si algún día se pasa a cluster, esto se reemplaza por el driver de presencia
 * de Colyseus. Hasta entonces, un `Set` hace el trabajo sin ceremonia.
 */

import type { IntelligenceEngine, LiveIntel } from '../intelligence/IntelligenceEngine.ts';
import type { LiveOpsCommand, LiveOpsResult } from '@esquel/shared';

/** Lo que el registro necesita de una sala. Nada más que esto. */
export interface RegisteredRoom {
  readonly roomId: string;
  readonly shardName: string;
  readonly population: number;
  readonly intelligence: IntelligenceEngine;
  runLiveOps(command: LiveOpsCommand): LiveOpsResult;
}

const salas = new Set<RegisteredRoom>();

export const registerRoom = (room: RegisteredRoom): void => {
  salas.add(room);
};

export const unregisterRoom = (room: RegisteredRoom): void => {
  salas.delete(room);
};

export const liveRooms = (): readonly RegisteredRoom[] => [...salas];

/** Foto agregada de todas las salas del proceso. */
export const liveIntel = (): { shards: number; online: number; rooms: LiveIntel[] } => {
  const rooms = [...salas].map((s) => s.intelligence.live());
  return {
    shards: salas.size,
    online: [...salas].reduce((s, r) => s + r.population, 0),
    rooms,
  };
};

/** Manda un comando a todas las salas (o a la que coincida con el shard). */
export const dispatchLiveOps = (command: LiveOpsCommand, shard?: string): LiveOpsResult[] =>
  [...salas]
    .filter((s) => !shard || s.shardName === shard)
    .map((s) => s.runLiveOps(command));
