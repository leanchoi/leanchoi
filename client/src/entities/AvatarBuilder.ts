/**
 * Generador procedural de avatares en bloques.
 *
 * Un militante de Esquel 2027 se arma con doce cajas y se reconoce de lejos por
 * tres cosas: el color de la pechera (su facción), lo que lleva encima (el rango)
 * y cómo camina.
 *
 * Los accesorios cuentan la carrera política sin necesidad de leer nada:
 *
 *   Chopanero → Soldado        termo y mate bajo el brazo
 *   Puntero → Mano Derecha     + bombo a la espalda
 *   Concejal → Subsecretario   + megáfono en la mano
 *   Secretario → Candidato     + pancarta con su propia cara
 *
 * Todo con geometría compartida entre avatares: cambiar de color por instancia
 * cuesta un material clonado, no una malla nueva.
 */

import {
  BoxGeometry,
  Group,
  Mesh,
  MeshLambertMaterial,
  type Object3D,
} from 'three';
import { FACTION_BY_ID, RANK_BY_LEVEL, type AvatarAnimation, type RankLevel } from '@esquel/shared';
import { PALETTE, shade } from '../engine/VoxelPalette.ts';

/** Geometría unitaria compartida: cada parte la escala a su medida. */
const UNIT = new BoxGeometry(1, 1, 1);

const SKIN_TONES = [0xd9a97f, 0xc08b62, 0x8d5c3b, 0xecc09b, 0x6f4429] as const;
const HAIR_TONES = [0x2a1d15, 0x3a2a20, 0x5c4327, 0x8a7256, 0x1a1a1a] as const;

export interface AvatarLook {
  /** Facción: define el color de la pechera. 0 = independiente. */
  readonly factionId: number;
  /** Rango 1..10: define los accesorios. */
  readonly rankTier: number;
  /** Semilla estable (el sessionId o el characterId) para piel y pelo. */
  readonly seed: string;
  /** Escala general del muñeco. */
  readonly scale?: number;
}

export interface BuiltAvatar {
  readonly group: Group;
  /** Actualiza la animación y devuelve la altura del rebote. */
  update(dt: number, speed: number, anim: AvatarAnimation): number;
  setFaction(factionId: number): void;
  setRank(rankTier: number): void;
  dispose(): void;
}

const hashSeed = (seed: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
};

const factionColor = (factionId: number): number => {
  const faction = FACTION_BY_ID[factionId];
  if (!faction) return PALETTE.concrete;
  return Number.parseInt(faction.colorPrimary.replace('#', ''), 16);
};

const part = (
  parent: Object3D,
  material: MeshLambertMaterial,
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
): Mesh => {
  const mesh = new Mesh(UNIT, material);
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  parent.add(mesh);
  return mesh;
};

/** Arma un avatar completo con su facción, su rango y sus fierros. */
export const buildAvatar = (look: AvatarLook): BuiltAvatar => {
  const seed = hashSeed(look.seed);
  const scale = look.scale ?? 1;
  const group = new Group();
  group.name = `avatar-${look.seed}`;
  group.scale.setScalar(scale);

  const skin = new MeshLambertMaterial({ color: SKIN_TONES[seed % SKIN_TONES.length] });
  const hair = new MeshLambertMaterial({ color: HAIR_TONES[(seed >> 3) % HAIR_TONES.length] });
  const torso = new MeshLambertMaterial({ color: factionColor(look.factionId) });
  const pants = new MeshLambertMaterial({ color: (seed >> 6) % 2 === 0 ? 0x2f3b52 : 0x3d3a33 });
  const shoes = new MeshLambertMaterial({ color: 0x2a2622 });
  const gear = new MeshLambertMaterial({ color: PALETTE.metal });
  const wood = new MeshLambertMaterial({ color: PALETTE.wood });
  const materials = [skin, hair, torso, pants, shoes, gear, wood];

  // Cuerpo.
  part(group, torso, 0, 1.16, 0, 0.62, 0.72, 0.34);
  // Pechera de campaña: una banda del color secundario cruzada al pecho.
  const faction = FACTION_BY_ID[look.factionId];
  if (faction) {
    const banda = new MeshLambertMaterial({
      color: Number.parseInt(faction.colorSecondary.replace('#', ''), 16),
    });
    materials.push(banda);
    part(group, banda, 0, 1.2, 0.19, 0.5, 0.16, 0.02);
  }
  part(group, skin, 0, 1.73, 0, 0.44, 0.42, 0.42);
  part(group, hair, 0, 1.95, 0, 0.48, 0.14, 0.46);

  // Extremidades con pivote en hombro/cadera.
  const limb = (x: number, y: number, w: number, h: number, material: MeshLambertMaterial): Object3D => {
    const pivot = new Group();
    pivot.position.set(x, y, 0);
    part(pivot, material, 0, -h / 2, 0, w, h, w);
    group.add(pivot);
    return pivot;
  };
  const leftArm = limb(-0.42, 1.5, 0.2, 0.66, skin);
  const rightArm = limb(0.42, 1.5, 0.2, 0.66, skin);
  const leftLeg = limb(-0.16, 0.8, 0.22, 0.8, pants);
  const rightLeg = limb(0.16, 0.8, 0.22, 0.8, pants);

  part(group, shoes, -0.16, 0.06, 0.04, 0.24, 0.12, 0.34);
  part(group, shoes, 0.16, 0.06, 0.04, 0.24, 0.12, 0.34);

  /* --- accesorios por rango ------------------------------------------- */
  const accesorios = new Group();
  accesorios.name = 'accesorios';
  group.add(accesorios);

  const equipar = (rank: number): void => {
    accesorios.clear();
    // Termo y mate: desde el primer día. No hay militancia sin agua caliente.
    part(accesorios, gear, -0.5, 1.15, -0.1, 0.16, 0.34, 0.16); // termo
    part(accesorios, wood, -0.52, 1.35, -0.1, 0.2, 0.16, 0.2); // mate
    if (rank >= 3) {
      // Bombo a la espalda.
      part(accesorios, wood, 0, 1.2, -0.32, 0.5, 0.5, 0.18);
      part(accesorios, new MeshLambertMaterial({ color: PALETTE.plasterLight }), 0, 1.2, -0.42, 0.44, 0.44, 0.03);
    }
    if (rank >= 5) {
      // Megáfono en la mano derecha.
      part(accesorios, gear, 0.52, 1.02, 0.16, 0.14, 0.14, 0.24);
      part(accesorios, new MeshLambertMaterial({ color: PALETTE.sign }), 0.52, 1.02, 0.34, 0.24, 0.24, 0.14);
    }
    if (rank >= 8) {
      // Pancarta con su propia cara: el que llegó, lo muestra.
      part(accesorios, wood, -0.62, 1.6, -0.05, 0.06, 1.4, 0.06);
      const cartel = new MeshLambertMaterial({ color: factionColor(look.factionId) });
      materials.push(cartel);
      part(accesorios, cartel, -0.62, 2.25, -0.05, 0.9, 0.6, 0.04);
      part(accesorios, skin, -0.62, 2.25, -0.02, 0.24, 0.28, 0.02);
    }
  };
  equipar(look.rankTier);

  /* --- animación -------------------------------------------------------- */
  let phase = 0;
  let mateTimer = 0;

  return {
    group,

    update(dt: number, speed: number, anim: AvatarAnimation): number {
      const moving = anim === 'WALK' || anim === 'RUN';
      const cadence = Math.min(2.6, speed * 0.42);
      phase += dt * (2.4 + cadence * 3.2) * (moving ? 1 : 0.15);

      const swing = moving ? Math.sin(phase) * Math.min(0.85, 0.18 + speed * 0.12) : Math.sin(phase) * 0.06;
      leftLeg.rotation.x = -swing;
      rightLeg.rotation.x = swing;

      switch (anim) {
        case 'MATE':
          // Cebar: el brazo derecho sube al pecho y se queda ahí.
          mateTimer += dt;
          rightArm.rotation.x = -1.25 + Math.sin(mateTimer * 3) * 0.12;
          leftArm.rotation.x = -0.5;
          break;
        case 'AFICHE':
          // Pegar afiche: los dos brazos arriba, brochazo de arriba abajo.
          rightArm.rotation.x = -2.2 + Math.sin(phase * 4) * 0.4;
          leftArm.rotation.x = -1.9;
          break;
        case 'DEBATE_READY':
          // Listo para la chicana: brazos abiertos, dedo apuntando.
          rightArm.rotation.x = -1.1;
          rightArm.rotation.z = -0.35;
          leftArm.rotation.x = -0.2;
          break;
        case 'JUMP':
          rightArm.rotation.x = -1.8;
          leftArm.rotation.x = -1.8;
          break;
        default:
          rightArm.rotation.x = -swing;
          rightArm.rotation.z = 0;
          leftArm.rotation.x = swing;
          break;
      }

      return moving ? Math.abs(Math.sin(phase)) * 0.045 : 0;
    },

    setFaction(factionId: number): void {
      torso.color.setHex(factionColor(factionId));
    },

    setRank(rankTier: number): void {
      equipar(rankTier);
    },

    dispose(): void {
      for (const material of materials) material.dispose();
      group.clear();
      group.removeFromParent();
    },
  };
};

/** Texto de la placa flotante: `[Puntero] Beto (MLT)`. */
export const nameplateFor = (alias: string, rankTier: number, factionId: number): string => {
  const rank = RANK_BY_LEVEL[Math.max(1, Math.min(10, rankTier)) as RankLevel];
  const faction = FACTION_BY_ID[factionId];
  return faction ? `[${rank.name}] ${alias} (${faction.shortName})` : `[${rank.name}] ${alias}`;
};

/** Color de la facción en formato CSS, para el HUD. */
export const factionCssColor = (factionId: number): string => {
  const faction = FACTION_BY_ID[factionId];
  return faction ? faction.colorPrimary : '#9a927f';
};

/** Tono más claro, para bordes y textos sobre fondo oscuro. */
export const factionAccent = (factionId: number): string =>
  `#${shade(factionColor(factionId), 0.35).toString(16).padStart(6, '0')}`;

/** Libera la geometría compartida (sólo al cerrar la aplicación). */
export const disposeAvatarGeometry = (): void => UNIT.dispose();
