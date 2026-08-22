/**
 * Volumen voxel para autoría de prefabs.
 *
 * API mínima y explícita: cajas, cajas huecas, techos a dos aguas y bandas de
 * ventanas. Con eso se construye un edificio entero sin salir de TypeScript, y
 * el resultado se serializa al RLE que consume el `BuildingLoader` del cliente.
 *
 * ORDEN DEL ÍNDICE (contrato con el cliente):
 *   índice = (y * sizeZ + z) * sizeX + x
 *
 * Marco local: `+X` ancho del frente, `+Y` altura, `+Z` profundidad hacia adentro
 * del lote. La cara del frente es `z = 0`.
 */

export class VoxelVolume {
  readonly sizeX: number;
  readonly sizeY: number;
  readonly sizeZ: number;
  readonly data: Uint8Array;

  constructor(sizeX: number, sizeY: number, sizeZ: number) {
    this.sizeX = sizeX;
    this.sizeY = sizeY;
    this.sizeZ = sizeZ;
    this.data = new Uint8Array(sizeX * sizeY * sizeZ);
  }

  private index(x: number, y: number, z: number): number {
    return (y * this.sizeZ + z) * this.sizeX + x;
  }

  inside(x: number, y: number, z: number): boolean {
    return x >= 0 && y >= 0 && z >= 0 && x < this.sizeX && y < this.sizeY && z < this.sizeZ;
  }

  set(x: number, y: number, z: number, material: number): void {
    if (!this.inside(x, y, z)) return;
    this.data[this.index(x, y, z)] = material;
  }

  get(x: number, y: number, z: number): number {
    return this.inside(x, y, z) ? (this.data[this.index(x, y, z)] as number) : 0;
  }

  /** Caja maciza: `[x0,x1)`, `[y0,y1)`, `[z0,z1)`. */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, material: number): void {
    for (let y = Math.max(0, y0); y < Math.min(this.sizeY, y1); y++) {
      for (let z = Math.max(0, z0); z < Math.min(this.sizeZ, z1); z++) {
        const base = (y * this.sizeZ + z) * this.sizeX;
        for (let x = Math.max(0, x0); x < Math.min(this.sizeX, x1); x++) {
          this.data[base + x] = material;
        }
      }
    }
  }

  /** Caja hueca: paredes de `thickness` voxels, interior vacío. */
  hollowBox(
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    material: number,
    thickness = 1,
  ): void {
    this.box(x0, y0, z0, x1, y1, z1, material);
    this.box(x0 + thickness, y0 + thickness, z0 + thickness, x1 - thickness, y1 - thickness, z1 - thickness, 0);
  }

  /** Piso macizo dentro de una caja (para entrepisos). */
  slab(x0: number, z0: number, x1: number, z1: number, y: number, material: number, thickness = 1): void {
    this.box(x0, y, z0, x1, y + thickness, z1, material);
  }

  /**
   * Techo a dos aguas sobre la huella `[x0,x1) × [z0,z1)`, con la cumbrera
   * paralela al eje indicado.
   */
  gableRoof(
    x0: number,
    z0: number,
    x1: number,
    z1: number,
    baseY: number,
    height: number,
    material: number,
    ridgeAxis: 'x' | 'z' = 'x',
  ): void {
    const span = ridgeAxis === 'x' ? z1 - z0 : x1 - x0;
    const halfSpan = Math.max(1, Math.floor(span / 2));
    for (let i = 0; i < height; i++) {
      const shrink = Math.round((i / height) * halfSpan);
      if (ridgeAxis === 'x') {
        this.box(x0, baseY + i, z0 + shrink, x1, baseY + i + 1, z1 - shrink, material);
      } else {
        this.box(x0 + shrink, baseY + i, z0, x1 - shrink, baseY + i + 1, z1, material);
      }
    }
  }

  /** Techo plano con parapeto perimetral. */
  parapetRoof(x0: number, z0: number, x1: number, z1: number, y: number, material: number, height = 2): void {
    this.slab(x0, z0, x1, z1, y, material);
    this.box(x0, y, z0, x1, y + height, z0 + 1, material);
    this.box(x0, y, z1 - 1, x1, y + height, z1, material);
    this.box(x0, y, z0, x0 + 1, y + height, z1, material);
    this.box(x1 - 1, y, z0, x1, y + height, z1, material);
  }

  /**
   * Banda de ventanas sobre una cara. `axis` indica sobre qué eje se repiten.
   * Se pintan a ambos lados del muro para que se vean desde adentro y desde afuera.
   */
  windowBand(params: {
    axis: 'x' | 'z';
    from: number;
    to: number;
    fixed: number;
    y: number;
    height: number;
    material: number;
    width?: number;
    gap?: number;
    depth?: number;
  }): void {
    const { axis, from, to, fixed, y, height, material } = params;
    const width = params.width ?? 3;
    const gap = params.gap ?? 3;
    const depth = params.depth ?? 1;
    for (let start = from; start + width <= to; start += width + gap) {
      if (axis === 'x') this.box(start, y, fixed, start + width, y + height, fixed + depth, material);
      else this.box(fixed, y, start, fixed + depth, y + height, start + width, material);
    }
  }

  /** Columnas verticales repetidas (galerías, pórticos). */
  columns(params: {
    axis: 'x' | 'z';
    from: number;
    to: number;
    fixed: number;
    y0: number;
    y1: number;
    material: number;
    thickness?: number;
    step?: number;
  }): void {
    const { axis, from, to, fixed, y0, y1, material } = params;
    const thickness = params.thickness ?? 2;
    const step = params.step ?? 8;
    for (let p = from; p + thickness <= to; p += step) {
      if (axis === 'x') this.box(p, y0, fixed, p + thickness, y1, fixed + thickness, material);
      else this.box(fixed, y0, p, fixed + thickness, y1, p + thickness, material);
    }
  }

  /** Cantidad de voxels no vacíos. */
  solidCount(): number {
    let n = 0;
    for (let i = 0; i < this.data.length; i++) if (this.data[i] !== 0) n++;
    return n;
  }

  /** Serializa a corridas `[material, cantidad]`. */
  toRle(): [number, number][] {
    const runs: [number, number][] = [];
    let current = this.data[0] as number;
    let count = 0;
    for (let i = 0; i < this.data.length; i++) {
      const v = this.data[i] as number;
      if (v === current) {
        count++;
      } else {
        runs.push([current, count]);
        current = v;
        count = 1;
      }
    }
    runs.push([current, count]);
    return runs;
  }
}
