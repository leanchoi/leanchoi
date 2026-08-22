/**
 * Avatar voxel del jugador.
 *
 * Un muñeco de bloques con pechera de facción: cabeza, torso, brazos y piernas,
 * animados con dos senos desfasados. Nada de esqueletos ni de mallas importadas;
 * a esta escala, un ciclo de caminata bien temporizado alcanza y sobra.
 */

import { BoxGeometry, Group, Mesh, MeshLambertMaterial, type Object3D } from 'three';
import { PALETTE } from '../engine/VoxelPalette.ts';

const materials = {
  skin: new MeshLambertMaterial({ color: 0xd9a97f }),
  hair: new MeshLambertMaterial({ color: 0x3a2a20 }),
  torso: new MeshLambertMaterial({ color: PALETTE.factionRed }),
  pants: new MeshLambertMaterial({ color: 0x2f3b52 }),
  shoes: new MeshLambertMaterial({ color: 0x2a2622 }),
};

const box = (w: number, h: number, d: number, material: MeshLambertMaterial): Mesh => {
  const mesh = new Mesh(new BoxGeometry(w, h, d), material);
  mesh.castShadow = false;
  return mesh;
};

export class Avatar {
  readonly group = new Group();
  private readonly leftArm: Object3D;
  private readonly rightArm: Object3D;
  private readonly leftLeg: Object3D;
  private readonly rightLeg: Object3D;
  private phase = 0;

  constructor(factionColor = PALETTE.factionRed) {
    this.group.name = 'Avatar';
    materials.torso.color.setHex(factionColor);

    const torso = box(0.62, 0.72, 0.34, materials.torso);
    torso.position.y = 1.16;
    this.group.add(torso);

    const head = box(0.44, 0.42, 0.42, materials.skin);
    head.position.y = 1.73;
    this.group.add(head);

    const hair = box(0.48, 0.14, 0.46, materials.hair);
    hair.position.y = 1.95;
    this.group.add(hair);

    // Brazos y piernas cuelgan de un pivote a la altura del hombro/cadera.
    const makeLimb = (x: number, y: number, w: number, h: number, material: MeshLambertMaterial): Object3D => {
      const pivot = new Group();
      pivot.position.set(x, y, 0);
      const limb = box(w, h, w, material);
      limb.position.y = -h / 2;
      pivot.add(limb);
      this.group.add(pivot);
      return pivot;
    };

    this.leftArm = makeLimb(-0.42, 1.5, 0.2, 0.66, materials.skin);
    this.rightArm = makeLimb(0.42, 1.5, 0.2, 0.66, materials.skin);
    this.leftLeg = makeLimb(-0.16, 0.8, 0.22, 0.8, materials.pants);
    this.rightLeg = makeLimb(0.16, 0.8, 0.22, 0.8, materials.pants);

    const shoeL = box(0.24, 0.12, 0.34, materials.shoes);
    shoeL.position.set(-0.16, 0.06, 0.04);
    const shoeR = shoeL.clone();
    shoeR.position.x = 0.16;
    this.group.add(shoeL, shoeR);
  }

  /** Pinta la pechera con el color de la facción. */
  setFactionColor(color: number): void {
    materials.torso.color.setHex(color);
  }

  /**
   * Anima el ciclo de caminata.
   * @param speed velocidad horizontal en m/s
   */
  update(dt: number, speed: number): void {
    const cadence = Math.min(2.6, speed * 0.42);
    this.phase += dt * (2.4 + cadence * 3.2) * (speed > 0.2 ? 1 : 0.15);
    const swing = Math.sin(this.phase) * Math.min(0.85, 0.18 + speed * 0.12);
    this.leftArm.rotation.x = swing;
    this.rightArm.rotation.x = -swing;
    this.leftLeg.rotation.x = -swing;
    this.rightLeg.rotation.x = swing;
  }

  /** Rebote vertical del ciclo de caminata; lo aplica la escena al posicionarlo. */
  get bobOffset(): number {
    return Math.abs(Math.sin(this.phase)) * 0.045;
  }

  dispose(): void {
    this.group.traverse((obj) => {
      if (obj instanceof Mesh) obj.geometry.dispose();
    });
    this.group.removeFromParent();
  }
}
