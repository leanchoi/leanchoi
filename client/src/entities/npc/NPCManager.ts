/**
 * NPCs del pueblo: aparición, patrullaje e interacción.
 *
 * Esquel no es sólo militantes: en la plaza hay gente que ya estaba antes de la
 * campaña y que va a seguir estando después. Cuatro arquetipos, todos con la
 * misma máquina de estados y comportamientos bien distintos:
 *
 *  · **El Loco del Pueblo** — te encara y te ofrece "unas trompadas" en un
 *    minijuego de reflejos: telegrafía el golpe, se abre una ventana corta y o
 *    esquivás o comés. Ganarle da fama de guapo; perder, un ojo morado.
 *  · **El Deportista Ilustre** — el que salió en el diario por la maratón del 92.
 *    Choque de manos: +50 de reputación y 45 segundos de piernas frescas.
 *  · **La Doña de las Tortas Fritas** — cura, no pregunta y no cobra. Con
 *    lluvia hace más porque es cuando corresponde.
 *  · **Perros Callejeros** — te siguen si tenés choripán y le ladran a los
 *    militantes del bando rival que se acercan demasiado.
 *
 * El manager no toca el store ni la red: emite eventos con efectos y quien lo
 * monta decide qué hacer con ellos. Así el mismo código sirve para la escena y
 * para un test sin Three andando.
 */

import { BoxGeometry, Group, Mesh, MeshLambertMaterial, Vector3, type Scene } from 'three';
import { createRng, seedFromString, type Rng } from '@esquel/shared';
import { PALETTE } from '../../engine/VoxelPalette.ts';
import type { Collider } from '../../engine/VoxelTypes.ts';
import { buildAvatar, type BuiltAvatar } from '../AvatarBuilder.ts';

/* --- contratos ------------------------------------------------------------ */

export const NPC_ARCHETYPES = ['loco', 'deportista', 'dona', 'perro'] as const;
export type NpcArchetype = (typeof NPC_ARCHETYPES)[number];

/** Lo que la interacción le hace al jugador. Lo aplica el que monta el manager. */
export type NpcEffect =
  | { readonly kind: 'salud'; readonly amount: number }
  | { readonly kind: 'reputacion'; readonly amount: number }
  | { readonly kind: 'guita'; readonly amount: number }
  | { readonly kind: 'velocidad'; readonly mult: number; readonly seconds: number }
  | { readonly kind: 'accion'; readonly action: string };

export interface NpcEvent {
  readonly npcId: string;
  readonly archetype: NpcArchetype;
  /** Lo que dice el NPC, para la burbuja o el chat de sistema. */
  readonly line: string;
  readonly effects: readonly NpcEffect[];
}

/** Cartelito de "apretá F", con el estado del minijuego si está abierto. */
export interface NpcPrompt {
  readonly npcId: string;
  readonly name: string;
  readonly hint: string;
  readonly distanceM: number;
  /** Ventana de reflejos abierta: hay que apretar YA. */
  readonly urgent: boolean;
}

export interface NpcView {
  readonly id: string;
  readonly archetype: NpcArchetype;
  readonly name: string;
  readonly position: Vector3;
  readonly headY: number;
  readonly line: string | null;
}

/** Militante remoto que el manager mira para decidir si los perros ladran. */
export interface NpcRival {
  readonly position: Vector3;
  readonly factionId: number;
}

export interface NpcUpdateContext {
  readonly playerPosition: Vector3;
  readonly playerFactionId: number;
  readonly colliders: readonly Collider[];
  /** Vecinos visibles, para el ladrido a los rivales. */
  readonly rivals: readonly NpcRival[];
  /** Llueve o nieva: la Doña se pone generosa, el Loco se guarda. */
  readonly badWeather: boolean;
}

export interface NPCManagerOptions {
  readonly scene: Scene;
  /** Semilla del pueblo: misma semilla, mismos vecinos en los mismos lugares. */
  readonly seed?: string;
  readonly onEvent?: (event: NpcEvent) => void;
}

/* --- números de diseño ---------------------------------------------------- */

const INTERACT_M = 3.6;
/** Radio en el que un NPC se da vuelta y te mira. */
const NOTICE_M = 9;
const WALK_SPEED = 1.35;
const DOG_SPEED = 2.4;
/** Cuánto dura la burbuja de lo que dijo. */
const LINE_SECONDS = 4.5;

/** Reintento por arquetipo, en segundos. */
const COOLDOWN: Readonly<Record<NpcArchetype, number>> = {
  loco: 90,
  deportista: 420,
  dona: 180,
  perro: 30,
};

/** Minijuego de trompadas. */
const TROMPADAS_ROUNDS = 3;
const TELEGRAPH_S = 0.85;
const WINDOW_S = 0.45;
const PUNCH_DAMAGE = 8;

/* --- frases --------------------------------------------------------------- */

const LINES: Readonly<Record<NpcArchetype, readonly string[]>> = {
  loco: [
    '¿Vos sos de los que reparten los papelitos?',
    'Yo voté una sola vez y me arrepiento todavía.',
    '¡Dale, tirame una, que no me hacés nada!',
  ],
  deportista: [
    'En el 92 corrí los diez kilómetros con viento en contra.',
    'Salí en la tapa del diario, ¿sabías?',
    'Vos entrenás poco, se te nota en la pisada.',
  ],
  dona: [
    'Comé algo, que estás flaquito de tanto caminar.',
    'Las hago con grasa, como corresponde.',
    'Andá con cuidado que a la noche baja la helada.',
  ],
  perro: ['¡Guau!', '¡Guau guau!', '(te olfatea el bolsillo)'],
};

const NAMES: Readonly<Record<NpcArchetype, readonly string[]>> = {
  loco: ['El Loco del Pueblo'],
  deportista: ['El Deportista Ilustre'],
  dona: ['La Doña de las Tortas Fritas', 'Doña Chola'],
  perro: ['Chocolate', 'Pancho', 'Tuerto', 'Bandido'],
};

/* --- perro voxel ---------------------------------------------------------- */

const DOG_BOX = new BoxGeometry(1, 1, 1);
const DOG_COATS = [0x6b5b46, 0x3a3733, 0x8a6a45, 0xb3a893];

interface BuiltDog {
  readonly group: Group;
  update(dt: number, speed: number): number;
  dispose(): void;
}

/** Perro de cuatro cajas: cuerpo, cabeza, patas y una cola que no para. */
const buildDog = (tint: number): BuiltDog => {
  const group = new Group();
  const coat = new MeshLambertMaterial({ color: tint });
  const dark = new MeshLambertMaterial({ color: 0x2a2622 });

  const parte = (w: number, h: number, d: number, x: number, y: number, z: number, mat: MeshLambertMaterial): Mesh => {
    const mesh = new Mesh(DOG_BOX, mat);
    mesh.scale.set(w, h, d);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    group.add(mesh);
    return mesh;
  };

  parte(0.32, 0.3, 0.66, 0, 0.44, 0, coat); // lomo
  parte(0.26, 0.26, 0.26, 0, 0.56, 0.42, coat); // cabeza
  parte(0.1, 0.1, 0.16, 0, 0.5, 0.58, dark); // hocico
  const cola = parte(0.08, 0.08, 0.28, 0, 0.5, -0.42, coat);
  const patas = [
    parte(0.1, 0.3, 0.1, 0.12, 0.15, 0.22, dark),
    parte(0.1, 0.3, 0.1, -0.12, 0.15, 0.22, dark),
    parte(0.1, 0.3, 0.1, 0.12, 0.15, -0.22, dark),
    parte(0.1, 0.3, 0.1, -0.12, 0.15, -0.22, dark),
  ];

  let fase = 0;
  return {
    group,
    update(dt, speed) {
      fase += dt * (2.5 + speed * 2.2);
      const swing = Math.sin(fase) * Math.min(0.5, 0.12 + speed * 0.1);
      patas[0].rotation.x = swing;
      patas[3].rotation.x = swing;
      patas[1].rotation.x = -swing;
      patas[2].rotation.x = -swing;
      cola.rotation.x = Math.sin(fase * 2.6) * 0.5;
      return Math.abs(Math.sin(fase)) * 0.02 * speed;
    },
    dispose() {
      coat.dispose();
      dark.dispose();
      group.clear();
    },
  };
};

/* --- estado interno ------------------------------------------------------- */

type NpcState = 'quieto' | 'patrulla' | 'atiende' | 'trompadas' | 'sigue' | 'ladra';
type PunchPhase = 'telegrafia' | 'ventana' | 'resuelto';

interface Npc {
  readonly id: string;
  readonly archetype: NpcArchetype;
  readonly name: string;
  readonly group: Group;
  readonly avatar: BuiltAvatar | null;
  readonly dog: BuiltDog | null;
  readonly home: Vector3;
  readonly waypoints: Vector3[];
  readonly position: Vector3;
  readonly headY: number;
  state: NpcState;
  yaw: number;
  waypoint: number;
  /** Segundos que le quedan de estar parado antes de seguir camino. */
  pausa: number;
  cooldown: number;
  /** Frase visible y cuánto le queda. */
  line: string | null;
  lineFor: number;
  speed: number;
  /** Minijuego de trompadas, sólo el Loco. */
  punch: { round: number; phase: PunchPhase; timer: number; hits: number; dodges: number } | null;
  /** El perro te sigue porque le diste de comer. */
  leashed: boolean;
  ladridoCooldown: number;
}

/* --- manager -------------------------------------------------------------- */

export class NPCManager {
  private readonly scene: Scene;
  private readonly root = new Group();
  private readonly npcs: Npc[] = [];
  private readonly rng: Rng;
  private readonly onEvent: (event: NpcEvent) => void;
  /** Choripanes en el bolsillo: moneda de cambio con los perros. */
  private choripanes = 0;
  private prompt: NpcPrompt | null = null;
  private readonly scratch = new Vector3();

  constructor(options: NPCManagerOptions) {
    this.scene = options.scene;
    this.rng = createRng(seedFromString(options.seed ?? 'esquel-npc'));
    this.onEvent = options.onEvent ?? (() => undefined);
    this.root.name = 'NPCs';
    this.scene.add(this.root);
    this.populate();
  }

  /* --- aparición ---------------------------------------------------------- */

  /**
   * Puebla el centro. Las posiciones salen de la semilla, así que el Loco está
   * siempre en la misma esquina y uno aprende dónde encontrarlo.
   */
  private populate(): void {
    this.spawn('loco', new Vector3(14, 0, -18));
    this.spawn('deportista', new Vector3(-34, 0, 26));
    this.spawn('dona', new Vector3(-58, 0, -12));
    this.spawn('dona', new Vector3(96, 0, 64));
    for (let i = 0; i < 4; i++) {
      const angulo = this.rng.next() * Math.PI * 2;
      const radio = 40 + this.rng.next() * 90;
      this.spawn('perro', new Vector3(Math.cos(angulo) * radio, 0, Math.sin(angulo) * radio));
    }
  }

  private spawn(archetype: NpcArchetype, home: Vector3): void {
    const idx = this.npcs.filter((n) => n.archetype === archetype).length;
    const id = `npc:${archetype}:${idx}`;
    const nombres = NAMES[archetype];
    const name = nombres[idx % nombres.length];

    const group = new Group();
    group.name = id;
    group.position.copy(home);

    let avatar: BuiltAvatar | null = null;
    let dog: BuiltDog | null = null;
    if (archetype === 'perro') {
      dog = buildDog(DOG_COATS[Math.floor(this.rng.next() * DOG_COATS.length)] ?? PALETTE.dirt);
      group.add(dog.group);
    } else {
      avatar = buildAvatar({ factionId: 0, rankTier: 1, seed: id, scale: archetype === 'dona' ? 0.94 : 1 });
      group.add(avatar.group);
    }
    this.root.add(group);

    /** Ronda de cuatro puntos alrededor de la casa: nadie camina en línea recta. */
    const waypoints: Vector3[] = [];
    const vuelta = archetype === 'perro' ? 26 : 16;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + this.rng.next() * 0.6;
      const r = vuelta * (0.5 + this.rng.next() * 0.8);
      waypoints.push(new Vector3(home.x + Math.cos(a) * r, 0, home.z + Math.sin(a) * r));
    }

    this.npcs.push({
      id,
      archetype,
      name,
      group,
      avatar,
      dog,
      home: home.clone(),
      waypoints,
      position: home.clone(),
      headY: archetype === 'perro' ? 0.95 : 1.95,
      state: 'patrulla',
      yaw: this.rng.next() * Math.PI * 2,
      waypoint: 0,
      pausa: this.rng.next() * 4,
      cooldown: 0,
      line: null,
      lineFor: 0,
      speed: 0,
      punch: null,
      leashed: false,
      ladridoCooldown: 0,
    });
  }

  /* --- bucle -------------------------------------------------------------- */

  update(dt: number, ctx: NpcUpdateContext): void {
    let mejor: NpcPrompt | null = null;

    for (const npc of this.npcs) {
      npc.cooldown = Math.max(0, npc.cooldown - dt);
      npc.ladridoCooldown = Math.max(0, npc.ladridoCooldown - dt);
      if (npc.lineFor > 0) {
        npc.lineFor -= dt;
        if (npc.lineFor <= 0) npc.line = null;
      }

      const distancia = npc.position.distanceTo(ctx.playerPosition);

      if (npc.punch) this.tickTrompadas(npc, dt, distancia);
      else if (npc.leashed) this.tickPerroSuelto(npc, dt, ctx);
      else this.tickPatrulla(npc, dt, ctx, distancia);

      this.applyTransform(npc, dt);

      const hint = this.hintFor(npc, ctx, distancia);
      if (hint && (!mejor || distancia < mejor.distanceM)) {
        mejor = {
          npcId: npc.id,
          name: npc.name,
          hint,
          distanceM: Number(distancia.toFixed(1)),
          urgent: npc.punch?.phase === 'ventana',
        };
      }
    }

    this.prompt = mejor;
  }

  /** Camina la ronda, se frena a saludar y se da vuelta si lo mirás. */
  private tickPatrulla(npc: Npc, dt: number, ctx: NpcUpdateContext, distancia: number): void {
    if (distancia < NOTICE_M) {
      // Te vio: se planta y te mira mientras estés cerca.
      npc.state = 'atiende';
      npc.speed = 0;
      npc.yaw = Math.atan2(ctx.playerPosition.x - npc.position.x, ctx.playerPosition.z - npc.position.z);
      if (npc.line === null && npc.cooldown <= 0 && distancia < NOTICE_M * 0.6) {
        this.say(npc, this.pick(LINES[npc.archetype]));
      }
      return;
    }

    if (npc.pausa > 0) {
      npc.pausa -= dt;
      npc.state = 'quieto';
      npc.speed = 0;
      return;
    }

    npc.state = 'patrulla';
    const destino = npc.waypoints[npc.waypoint] ?? npc.home;
    const paso = npc.archetype === 'perro' ? DOG_SPEED * 0.6 : WALK_SPEED;
    const velocidad = ctx.badWeather ? paso * 0.8 : paso;
    if (this.advance(npc, destino, velocidad, dt, ctx.colliders)) {
      npc.waypoint = (npc.waypoint + 1) % npc.waypoints.length;
      npc.pausa = 1.5 + this.rng.next() * 5;
    }
  }

  /** Perro con dueño temporal: te sigue y ladra a los rivales que se arriman. */
  private tickPerroSuelto(npc: Npc, dt: number, ctx: NpcUpdateContext): void {
    const distancia = npc.position.distanceTo(ctx.playerPosition);
    npc.state = 'sigue';

    for (const rival of ctx.rivals) {
      if (rival.factionId === ctx.playerFactionId || rival.factionId === 0) continue;
      if (rival.position.distanceTo(npc.position) > 12) continue;
      if (npc.ladridoCooldown > 0) continue;
      npc.ladridoCooldown = 8;
      npc.state = 'ladra';
      this.say(npc, '¡Guau! ¡Guau guau!');
      this.emit(npc, 'Le ladró al puntero de enfrente.', [{ kind: 'reputacion', amount: 2 }]);
      break;
    }

    if (distancia > 3.2) {
      this.scratch.copy(ctx.playerPosition);
      this.advance(npc, this.scratch, DOG_SPEED, dt, ctx.colliders);
    } else {
      npc.speed = 0;
      npc.yaw = Math.atan2(ctx.playerPosition.x - npc.position.x, ctx.playerPosition.z - npc.position.z);
    }

    // Se aburre y vuelve a la calle.
    if (distancia > 60) {
      npc.leashed = false;
      npc.state = 'patrulla';
      this.say(npc, '(se va detrás de otro olor)');
    }
  }

  /**
   * Minijuego de reflejos: telegrafía, abre la ventana y cobra si no esquivaste.
   * No hay dificultad progresiva ni combos: son tres trompadas y a otra cosa.
   */
  private tickTrompadas(npc: Npc, dt: number, distancia: number): void {
    const punch = npc.punch;
    if (!punch) return;
    npc.state = 'trompadas';
    npc.speed = 0;

    if (distancia > INTERACT_M * 2.2) {
      // Te fuiste en el medio: se queda hablando solo.
      this.say(npc, '¡Eh, volvé que recién empezaba!');
      npc.punch = null;
      npc.cooldown = COOLDOWN.loco;
      return;
    }

    punch.timer -= dt;
    if (punch.timer > 0) return;

    if (punch.phase === 'telegrafia') {
      punch.phase = 'ventana';
      punch.timer = WINDOW_S;
      this.say(npc, '¡Ahí va!');
      return;
    }

    if (punch.phase === 'ventana') {
      // No apretaste: te la comiste.
      punch.hits += 1;
      this.say(npc, this.pick(['¡Toma!', '¡Te la puse!', '¡Dormías!']));
      this.emit(npc, 'Te comiste una trompada del Loco.', [{ kind: 'salud', amount: -PUNCH_DAMAGE }]);
      this.nextRound(npc);
    }
  }

  private nextRound(npc: Npc): void {
    const punch = npc.punch;
    if (!punch) return;
    punch.round += 1;
    if (punch.round > TROMPADAS_ROUNDS) {
      this.finishTrompadas(npc);
      return;
    }
    punch.phase = 'telegrafia';
    punch.timer = TELEGRAPH_S + this.rng.next() * 0.5;
  }

  private finishTrompadas(npc: Npc): void {
    const punch = npc.punch;
    if (!punch) return;
    npc.punch = null;
    npc.cooldown = COOLDOWN.loco;

    if (punch.dodges >= TROMPADAS_ROUNDS) {
      this.say(npc, '¡Sos rápido vos! Andá tranquilo.');
      this.emit(npc, 'Le esquivaste las tres al Loco del Pueblo.', [
        { kind: 'reputacion', amount: 45 },
        { kind: 'guita', amount: 5_000 },
        { kind: 'accion', action: 'aguante_loco' },
      ]);
    } else if (punch.dodges > 0) {
      this.say(npc, 'Zafaste alguna, no está mal.');
      this.emit(npc, `Esquivaste ${punch.dodges} de ${TROMPADAS_ROUNDS}.`, [
        { kind: 'reputacion', amount: 12 * punch.dodges },
      ]);
    } else {
      this.say(npc, 'Andá a entrenar, pibe.');
      this.emit(npc, 'Te agarró desprevenido las tres veces.', [{ kind: 'reputacion', amount: -8 }]);
    }
  }

  /* --- interacción -------------------------------------------------------- */

  /**
   * Tecla de acción. Si hay una ventana de trompadas abierta esquiva; si no,
   * interactúa con el NPC más cercano. Devuelve `true` si algo pasó, para que
   * quien la llama no dispare además la acción genérica.
   */
  press(playerPosition: Vector3, ctx?: { readonly badWeather?: boolean }): boolean {
    const enGuardia = this.npcs.find((n) => n.punch !== null);
    if (enGuardia?.punch) {
      const punch = enGuardia.punch;
      if (punch.phase === 'ventana') {
        punch.dodges += 1;
        punch.phase = 'resuelto';
        this.say(enGuardia, this.pick(['¡Uh, la esquivó!', '¡Mirá vos!', '¡Andá, tenés cintura!']));
        this.nextRound(enGuardia);
      } else if (punch.phase === 'telegrafia') {
        // Te adelantaste: quedaste vendido.
        punch.hits += 1;
        punch.phase = 'resuelto';
        this.say(enGuardia, '¡Muy apurado!');
        this.emit(enGuardia, 'Te adelantaste y comiste igual.', [{ kind: 'salud', amount: -PUNCH_DAMAGE }]);
        this.nextRound(enGuardia);
      }
      return true;
    }

    const cerca = this.nearest(playerPosition, INTERACT_M);
    if (!cerca || cerca.cooldown > 0) return false;
    return this.interact(cerca, ctx?.badWeather ?? false);
  }

  private interact(npc: Npc, badWeather: boolean): boolean {
    switch (npc.archetype) {
      case 'deportista': {
        npc.cooldown = COOLDOWN.deportista;
        this.say(npc, '¡Esa mano! Así se corre, con la cabeza en alto.');
        this.emit(npc, 'Chocaste los cinco con el Deportista Ilustre.', [
          { kind: 'reputacion', amount: 50 },
          { kind: 'velocidad', mult: 1.2, seconds: 45 },
          { kind: 'accion', action: 'choque_de_manos' },
        ]);
        return true;
      }
      case 'dona': {
        npc.cooldown = COOLDOWN.dona;
        const cura = badWeather ? 48 : 32;
        this.say(npc, badWeather ? 'Con este frío te doy dos, no discutas.' : 'Tomá, recién hechas.');
        this.emit(npc, 'Comiste tortas fritas de la Doña.', [
          { kind: 'salud', amount: cura },
          { kind: 'reputacion', amount: 4 },
          { kind: 'accion', action: 'torta_frita' },
        ]);
        return true;
      }
      case 'loco': {
        if (badWeather) {
          npc.cooldown = 20;
          this.say(npc, 'Con esta lluvia no peleo, se me arruina la campera.');
          return true;
        }
        npc.punch = { round: 1, phase: 'telegrafia', timer: TELEGRAPH_S, hits: 0, dodges: 0 };
        this.say(npc, '¡Vamo’ a ver si sos tan vivo! Tres nomás.');
        return true;
      }
      case 'perro': {
        if (this.choripanes <= 0) {
          npc.cooldown = COOLDOWN.perro;
          this.say(npc, '(te mira el bolsillo vacío y se va)');
          return true;
        }
        this.choripanes -= 1;
        npc.leashed = true;
        npc.cooldown = COOLDOWN.perro;
        this.say(npc, '¡Guau! (mueve la cola)');
        this.emit(npc, `${npc.name} te adoptó: te sigue y le ladra a los rivales.`, [
          { kind: 'accion', action: 'perro_adoptado' },
        ]);
        return true;
      }
      default:
        return false;
    }
  }

  /** Choripanes disponibles para comprar perros. */
  addChoripan(cantidad = 1): void {
    this.choripanes = Math.max(0, Math.min(9, this.choripanes + cantidad));
  }

  get choripanCount(): number {
    return this.choripanes;
  }

  /** Cartelito de interacción vigente, o `null` si no hay nadie cerca. */
  activePrompt(): NpcPrompt | null {
    return this.prompt;
  }

  /** Vista para placas y burbujas. */
  views(): NpcView[] {
    return this.npcs.map((npc) => ({
      id: npc.id,
      archetype: npc.archetype,
      name: npc.name,
      position: npc.position,
      headY: npc.headY,
      line: npc.line,
    }));
  }

  get count(): number {
    return this.npcs.length;
  }

  dispose(): void {
    for (const npc of this.npcs) {
      npc.avatar?.dispose();
      npc.dog?.dispose();
      this.root.remove(npc.group);
    }
    this.npcs.length = 0;
    this.scene.remove(this.root);
  }

  /* --- utilidades --------------------------------------------------------- */

  private hintFor(npc: Npc, ctx: NpcUpdateContext, distancia: number): string | null {
    if (npc.punch) {
      return npc.punch.phase === 'ventana' ? 'F — ¡ESQUIVÁ!' : 'Aguantá el golpe…';
    }
    if (distancia > INTERACT_M) return null;
    if (npc.cooldown > 0) return `${npc.name} — en un rato`;
    switch (npc.archetype) {
      case 'loco':
        return ctx.badWeather ? `${npc.name} — no pelea con lluvia` : `F — trompadas con ${npc.name}`;
      case 'deportista':
        return `F — chocar los cinco con ${npc.name}`;
      case 'dona':
        return `F — aceptar tortas fritas de ${npc.name}`;
      case 'perro':
        return this.choripanes > 0 ? `F — darle choripán a ${npc.name}` : `${npc.name} — te falta un choripán`;
      default:
        return null;
    }
  }

  private nearest(from: Vector3, maxM: number): Npc | null {
    let mejor: Npc | null = null;
    let mejorD = maxM;
    for (const npc of this.npcs) {
      const d = npc.position.distanceTo(from);
      if (d <= mejorD) {
        mejor = npc;
        mejorD = d;
      }
    }
    return mejor;
  }

  /** Un paso hacia el destino. Devuelve `true` si llegó (o si se dio la cabeza). */
  private advance(npc: Npc, destino: Vector3, speed: number, dt: number, colliders: readonly Collider[]): boolean {
    const dx = destino.x - npc.position.x;
    const dz = destino.z - npc.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.6) {
      npc.speed = 0;
      return true;
    }

    const paso = Math.min(dist, speed * dt);
    const nx = npc.position.x + (dx / dist) * paso;
    const nz = npc.position.z + (dz / dist) * paso;

    if (this.blocked(nx, nz, colliders)) {
      npc.speed = 0;
      return true; // pared: que elija otro punto de la ronda
    }

    npc.position.set(nx, 0, nz);
    npc.yaw = Math.atan2(dx, dz);
    npc.speed = speed;
    return false;
  }

  private blocked(x: number, z: number, colliders: readonly Collider[]): boolean {
    const r = 0.4;
    for (const c of colliders) {
      if (x + r > c.minX && x - r < c.maxX && z + r > c.minZ && z - r < c.maxZ) return true;
    }
    return false;
  }

  private applyTransform(npc: Npc, dt: number): void {
    const bob = npc.dog ? npc.dog.update(dt, npc.speed) : (npc.avatar?.update(dt, npc.speed, npc.speed > 0.3 ? 'WALK' : 'IDLE') ?? 0);
    npc.group.position.set(npc.position.x, npc.position.y + bob, npc.position.z);
    npc.group.rotation.y = npc.yaw;
  }

  private say(npc: Npc, line: string): void {
    npc.line = line;
    npc.lineFor = LINE_SECONDS;
  }

  private emit(npc: Npc, line: string, effects: readonly NpcEffect[]): void {
    this.onEvent({ npcId: npc.id, archetype: npc.archetype, line, effects });
  }

  private pick<T>(list: readonly T[]): T {
    return this.rng.pick(list);
  }
}

/** Libera la geometría compartida de los perros (sólo al cerrar la aplicación). */
export const disposeNpcGeometry = (): void => DOG_BOX.dispose();
