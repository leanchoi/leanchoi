/**
 * Estado de la aplicación fuera del canvas.
 *
 * El bucle de render **no** vive acá: el loop de Three escribe en este store a
 * baja frecuencia (4 Hz para stats, 1 Hz para el reloj y la cuenta regresiva) y
 * la UI de React lee con selectores finos. Así el HUD se actualiza sin re-renders
 * en cada cuadro.
 */

import { create } from 'zustand';
import {
  BARRIO_BY_ID,
  FACTION_BY_ID,
  RANK_BY_LEVEL,
  buildElectionState,
  buildElectionCalendar,
  climatologicalFallbackNoop,
  type Barrio,
  type ElectionState,
  type RankLevel,
  type WorldWeather,
} from './storeContracts.ts';
import { CONFIG } from '../config.ts';

export interface PlayerSnapshot {
  readonly nick: string;
  readonly health: number;
  readonly healthMax: number;
  readonly stamina: number;
  readonly staminaMax: number;
  /** Guita en centavos. */
  readonly money: number;
  readonly reputation: number;
  readonly xp: number;
  readonly rankLevel: RankLevel;
  readonly factionId: number | null;
  readonly barrio: Barrio;
  readonly position: { x: number; y: number; z: number };
}

export interface Diagnostics {
  readonly fps: number;
  readonly chunks: number;
  readonly instances: number;
  readonly pending: number;
  readonly prefabs: number;
  readonly colliders: number;
}

/** Placa flotante de un vecino, ya proyectada a coordenadas de pantalla. */
export interface OverlayEntry {
  readonly sessionId: string;
  readonly nameplate: string;
  readonly color: string;
  readonly screenX: number;
  readonly screenY: number;
  readonly distanceM: number;
  readonly speaking: boolean;
  /** Burbuja de chat vigente, si dijo algo hace poco. */
  readonly chatText?: string;
}

/** Estado de la conexión con el servidor autoritativo. */
export interface NetSnapshot {
  readonly status: 'desconectado' | 'conectando' | 'conectado' | 'error';
  readonly sessionId: string;
  readonly shardName: string;
  readonly population: number;
  readonly detail: string;
  /** Pares de voz conectados. */
  readonly voicePeers: number;
  readonly micState: 'apagado' | 'pidiendo' | 'encendido' | 'silenciado' | 'denegado';
  readonly speaking: boolean;
}

export interface ChatEntry {
  readonly id: number;
  readonly nick: string;
  readonly text: string;
  readonly channel: 'local' | 'faccion' | 'global' | 'sistema';
  readonly at: number;
}

export interface ClockSnapshot {
  /** `HH:MM` en hora de Esquel. */
  readonly localTime: string;
  readonly phase: 'noche' | 'amanecer' | 'dia' | 'atardecer';
  readonly sunrise: string;
  readonly sunset: string;
  readonly elevationDeg: number;
}

interface GameStore {
  player: PlayerSnapshot;
  weather: WorldWeather;
  clock: ClockSnapshot;
  election: ElectionState;
  diagnostics: Diagnostics;
  /** Dirección legible donde está parado el jugador. */
  location: string;
  showDiagnostics: boolean;

  /* --- multijugador --- */
  net: NetSnapshot;
  /** Placas y burbujas de los vecinos visibles, a 15 Hz. */
  overlays: readonly OverlayEntry[];
  /** Últimos mensajes de chat recibidos. */
  chatLog: readonly ChatEntry[];
  /** `true` mientras el jugador está escribiendo (bloquea WASD). */
  chatOpen: boolean;
  /** Token de acceso vigente; vacío hasta que se registra o entra. */
  accessToken: string;

  setPlayer(patch: Partial<PlayerSnapshot>): void;
  setWeather(weather: WorldWeather): void;
  setClock(clock: ClockSnapshot): void;
  refreshElection(): void;
  setDiagnostics(patch: Partial<Diagnostics>): void;
  setLocation(location: string): void;
  toggleDiagnostics(): void;

  setNet(patch: Partial<NetSnapshot>): void;
  setOverlays(overlays: readonly OverlayEntry[]): void;
  pushChat(entry: Omit<ChatEntry, 'id'>): void;
  setChatOpen(open: boolean): void;
  setAccessToken(token: string): void;
}

let chatSeq = 0;

const electionCalendar = buildElectionCalendar(CONFIG.election.dayIso, !CONFIG.election.official);

export const useGameStore = create<GameStore>((set) => ({
  player: {
    nick: 'Militante',
    health: 100,
    healthMax: 100,
    stamina: 100,
    staminaMax: 100,
    money: 250_000,
    reputation: 0,
    xp: 0,
    rankLevel: 1,
    factionId: 3,
    barrio: 'centro',
    position: { x: 0, y: 0, z: -20 },
  },
  weather: climatologicalFallbackNoop(),
  clock: { localTime: '--:--', phase: 'dia', sunrise: '--:--', sunset: '--:--', elevationDeg: 0 },
  election: buildElectionState(Date.now(), electionCalendar),
  diagnostics: { fps: 0, chunks: 0, instances: 0, pending: 0, prefabs: 0, colliders: 0 },
  location: 'Esquel',
  showDiagnostics: false,

  net: {
    status: 'desconectado',
    sessionId: '',
    shardName: '',
    population: 0,
    detail: '',
    voicePeers: 0,
    micState: 'apagado',
    speaking: false,
  },
  overlays: [],
  chatLog: [],
  chatOpen: false,
  accessToken: '',

  setPlayer: (patch) => set((s) => ({ player: { ...s.player, ...patch } })),
  setWeather: (weather) => set({ weather }),
  setClock: (clock) => set({ clock }),
  refreshElection: () => set({ election: buildElectionState(Date.now(), electionCalendar) }),
  setDiagnostics: (patch) => set((s) => ({ diagnostics: { ...s.diagnostics, ...patch } })),
  setLocation: (location) => set({ location }),
  toggleDiagnostics: () => set((s) => ({ showDiagnostics: !s.showDiagnostics })),

  setNet: (patch) => set((s) => ({ net: { ...s.net, ...patch } })),
  setOverlays: (overlays) => set({ overlays }),
  pushChat: (entry) =>
    set((s) => ({ chatLog: [...s.chatLog.slice(-29), { ...entry, id: ++chatSeq }] })),
  setChatOpen: (chatOpen) => set({ chatOpen }),
  setAccessToken: (accessToken) => set({ accessToken }),
}));

/* --- derivados para el HUD ---------------------------------------- */

/** Guita formateada al uso local: `$ 2.500`. */
export const formatMoney = (centavos: number): string =>
  `$ ${Math.floor(centavos / 100).toLocaleString('es-AR')}`;

export const rankOf = (level: RankLevel) => RANK_BY_LEVEL[level];

export const factionOf = (id: number | null) => (id === null ? null : FACTION_BY_ID[id] ?? null);

export const barrioOf = (id: Barrio) => BARRIO_BY_ID[id];
