/**
 * Comercios auspiciados: marquesina, buff y medición.
 *
 * Cada local del catálogo se planta sobre su parcela real —la que sale de la
 * dirección: San Martín 450 es una parcela concreta de una manzana concreta— y
 * se le arma un cartel de cubos sobre la fachada. Nada de texturas: el cartel es
 * geometría, igual que el resto del pueblo.
 *
 * Lo que mide, que es la razón de ser del sistema:
 *  · **Impresión**: un jugador distinto que pasó a menos de 15 m. Se cuenta una
 *    vez por visita, no una vez por cuadro: quedarse parado no infla el número.
 *  · **Entrada**: se metió en la puerta.
 *  · **Consumo**: se llevó el buff (y pagó, si no era de la casa).
 *
 * El manager no toca el store ni la red: emite eventos y quien lo monta decide.
 * La telemetría comercial sale por el mismo colector que el resto.
 */

import {
  BoxGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  Vector3,
  type Scene,
} from 'three';
import { parcelGeometry, resolveAddress } from '../EsquelStreetGrid.ts';
import { GLYPH_H, textPixels, textWidth } from './VoxelFont.ts';
import { SPONSORS, isSponsorOpen, type SponsorBuff, type SponsorDefinition } from '@esquel/shared';

/* --- números de diseño ---------------------------------------------------- */

/** Distancia a la que se puede entrar y consumir. */
const ENTER_M = 4;
/** Una impresión por visita: hay que alejarse esto para que cuente de nuevo. */
const REARM_M = 28;
/** Y esperar esto, para que ir y venir no infle el número. */
const REARM_MS = 90_000;
/** Tamaño del cubo de la marquesina, en metros. */
const PIXEL_M = 0.16;

/* --- contratos ------------------------------------------------------------ */

export type SponsorEvent =
  | { readonly kind: 'impresion'; readonly sponsor: SponsorDefinition; readonly distanceM: number; readonly seconds: number }
  | { readonly kind: 'entrada'; readonly sponsor: SponsorDefinition }
  | { readonly kind: 'consumo'; readonly sponsor: SponsorDefinition; readonly buff: SponsorBuff }
  | { readonly kind: 'sin_guita'; readonly sponsor: SponsorDefinition; readonly faltan: number }
  | { readonly kind: 'cerrado'; readonly sponsor: SponsorDefinition };

export interface SponsorPrompt {
  readonly sponsorId: number;
  readonly name: string;
  readonly hint: string;
  readonly distanceM: number;
  readonly open: boolean;
}

export interface SponsorManagerOptions {
  readonly scene: Scene;
  readonly onEvent?: (event: SponsorEvent) => void;
  /** Guita disponible, en centavos: el manager no la administra, la consulta. */
  readonly moneyOf?: () => number;
}

interface LocalMontado {
  readonly def: SponsorDefinition;
  readonly group: Group;
  readonly position: Vector3;
  /** Frente del local, para saber de qué lado se entra. */
  readonly facingYawDeg: number;
  /** Cuándo entró al radio de impresión esta visita. */
  dentroDesde: number | null;
  /** Última impresión contada. */
  ultimaImpresion: number;
  /** Distancia a la que se fue después de la última impresión. */
  rearmado: boolean;
  materiales: MeshLambertMaterial[];
  geometrias: BoxGeometry[];
}

/* --- manager -------------------------------------------------------------- */

export class SponsorManager {
  private readonly scene: Scene;
  private readonly root = new Group();
  private readonly locales: LocalMontado[] = [];
  private readonly onEvent: (event: SponsorEvent) => void;
  private readonly moneyOf: () => number;
  private prompt: SponsorPrompt | null = null;
  private readonly stats = { impresiones: 0, entradas: 0, consumos: 0 };

  constructor(options: SponsorManagerOptions) {
    this.scene = options.scene;
    this.onEvent = options.onEvent ?? (() => undefined);
    this.moneyOf = options.moneyOf ?? (() => 0);
    this.root.name = 'Auspicios';
    this.scene.add(this.root);
    this.montar();
  }

  /* --- montaje -------------------------------------------------------- */

  private montar(): void {
    for (const def of SPONSORS) {
      const direccion = resolveAddress(def.street, def.streetNumber);
      if (!direccion) {
        // Una dirección que no resuelve es un error de catálogo, no del mundo:
        // se avisa por consola y el resto de los locales igual se montan.
        console.warn(`[auspicios] ${def.name}: la dirección ${def.street} ${def.streetNumber} no resuelve.`);
        continue;
      }

      const geo = parcelGeometry(direccion.cell, direccion.parcelIndex);
      const group = new Group();
      group.name = `sponsor-${def.slug}`;
      group.position.set(geo.center.x, 0, geo.center.z);
      group.rotation.y = (geo.facingYawDeg * Math.PI) / 180;

      const materiales: MeshLambertMaterial[] = [];
      const geometrias: BoxGeometry[] = [];

      // Frente del local: un panel del color de la marca sobre la línea municipal.
      const frenteMat = new MeshLambertMaterial({ color: def.facadeColor });
      const frenteGeo = new BoxGeometry(geo.frontageM * 0.9, 3.2, 0.35);
      const frente = new Mesh(frenteGeo, frenteMat);
      frente.position.set(0, 1.6, geo.depthM / 2 - 0.2);
      frente.castShadow = true;
      group.add(frente);
      materiales.push(frenteMat);
      geometrias.push(frenteGeo);

      // Marquesina: el cartel de cubos, centrado sobre el frente.
      const cartel = this.construirCartel(def, geo.frontageM * 0.9);
      cartel.group.position.set(0, 3.9, geo.depthM / 2 - 0.1);
      group.add(cartel.group);
      materiales.push(...cartel.materiales);
      geometrias.push(...cartel.geometrias);

      this.root.add(group);
      this.locales.push({
        def,
        group,
        position: new Vector3(geo.center.x, 0, geo.center.z),
        facingYawDeg: geo.facingYawDeg,
        dentroDesde: null,
        ultimaImpresion: 0,
        rearmado: true,
        materiales,
        geometrias,
      });
    }
  }

  /**
   * Arma el cartel: una tabla oscura de fondo y un `InstancedMesh` con un cubo
   * por píxel encendido. Una sola llamada de dibujo por local.
   */
  private construirCartel(
    def: SponsorDefinition,
    anchoDisponible: number,
  ): { group: Group; materiales: MeshLambertMaterial[]; geometrias: BoxGeometry[] } {
    const group = new Group();
    const pixeles = textPixels(def.marqueeText);
    const anchoCeldas = textWidth(def.marqueeText);

    // Si el texto no entra en el frente, se achica el píxel en vez de recortar
    // la palabra: un cartel a medias no dice nada.
    const escala = Math.min(PIXEL_M, (anchoDisponible * 0.86) / Math.max(1, anchoCeldas));

    const tablaMat = new MeshLambertMaterial({ color: 0x1a1712 });
    const tablaGeo = new BoxGeometry(anchoCeldas * escala + 0.3, GLYPH_H * escala + 0.24, 0.14);
    const tabla = new Mesh(tablaGeo, tablaMat);
    tabla.castShadow = true;
    group.add(tabla);

    const letraMat = new MeshLambertMaterial({ color: def.marqueeColor, emissive: def.marqueeColor, emissiveIntensity: 0.35 });
    const letraGeo = new BoxGeometry(escala * 0.92, escala * 0.92, 0.1);
    const letras = new InstancedMesh(letraGeo, letraMat, Math.max(1, pixeles.length));
    letras.name = `marquesina-${def.slug}`;

    const m = new Matrix4();
    const x0 = -(anchoCeldas * escala) / 2 + escala / 2;
    const y0 = (GLYPH_H * escala) / 2 - escala / 2;
    pixeles.forEach((p, i) => {
      m.makeTranslation(x0 + p.x * escala, y0 - p.y * escala, 0.1);
      letras.setMatrixAt(i, m);
    });
    letras.instanceMatrix.needsUpdate = true;
    group.add(letras);

    return { group, materiales: [tablaMat, letraMat], geometrias: [tablaGeo, letraGeo] };
  }

  /* --- bucle ---------------------------------------------------------- */

  /**
   * Mide la cercanía del jugador a cada local.
   * `localMinute` decide si está abierto: un cartel apagado no ofrece nada.
   */
  update(playerPosition: Vector3, localMinute: number): void {
    const ahora = Date.now();
    let mejor: SponsorPrompt | null = null;

    for (const local of this.locales) {
      const d = local.position.distanceTo(playerPosition);
      const abierto = isSponsorOpen(local.def, localMinute);

      // Impresión: entró al radio y se quedó al menos un segundo.
      if (d <= local.def.impressionRadiusM) {
        local.dentroDesde ??= ahora;
        const segundos = (ahora - local.dentroDesde) / 1000;
        if (
          segundos >= 1 &&
          local.rearmado &&
          ahora - local.ultimaImpresion >= REARM_MS
        ) {
          local.ultimaImpresion = ahora;
          local.rearmado = false;
          this.stats.impresiones++;
          this.onEvent({
            kind: 'impresion',
            sponsor: local.def,
            distanceM: Number(d.toFixed(1)),
            seconds: Number(segundos.toFixed(1)),
          });
        }
      } else {
        local.dentroDesde = null;
        // Se rearma recién cuando se fue de verdad, no cuando cruzó la vereda.
        if (d > REARM_M) local.rearmado = true;
      }

      if (d <= ENTER_M && (!mejor || d < mejor.distanceM)) {
        mejor = {
          sponsorId: local.def.id,
          name: local.def.name,
          hint: abierto
            ? `F — ${local.def.buff.name}${local.def.buff.priceCentavos > 0 ? ` ($ ${Math.round(local.def.buff.priceCentavos / 100)})` : ' (de la casa)'}`
            : `${local.def.name} — cerrado`,
          distanceM: Number(d.toFixed(1)),
          open: abierto,
        };
      }
    }

    this.prompt = mejor;
  }

  /**
   * El jugador apretó la tecla de interacción con un local cerca.
   * Devuelve `true` si el local se hizo cargo de la tecla.
   */
  press(playerPosition: Vector3, localMinute: number): boolean {
    const cerca = this.nearest(playerPosition, ENTER_M);
    if (!cerca) return false;

    if (!isSponsorOpen(cerca.def, localMinute)) {
      this.onEvent({ kind: 'cerrado', sponsor: cerca.def });
      return true;
    }

    this.stats.entradas++;
    this.onEvent({ kind: 'entrada', sponsor: cerca.def });

    const precio = cerca.def.buff.priceCentavos;
    if (precio > 0) {
      const guita = this.moneyOf();
      if (guita < precio) {
        this.onEvent({ kind: 'sin_guita', sponsor: cerca.def, faltan: precio - guita });
        return true;
      }
    }

    this.stats.consumos++;
    this.onEvent({ kind: 'consumo', sponsor: cerca.def, buff: cerca.def.buff });
    return true;
  }

  /** Cartelito vigente, o `null` si no hay ningún local al lado. */
  activePrompt(): SponsorPrompt | null {
    return this.prompt;
  }

  /** Locales montados, para placas y para el minimapa. */
  views(): { id: number; name: string; position: Vector3; headY: number }[] {
    return this.locales.map((l) => ({ id: l.def.id, name: l.def.name, position: l.position, headY: 4.6 }));
  }

  diagnostics(): Readonly<Record<string, number>> {
    return { locales: this.locales.length, ...this.stats };
  }

  dispose(): void {
    for (const local of this.locales) {
      for (const mat of local.materiales) mat.dispose();
      for (const geo of local.geometrias) geo.dispose();
      this.root.remove(local.group);
    }
    this.locales.length = 0;
    this.scene.remove(this.root);
  }

  private nearest(from: Vector3, maxM: number): LocalMontado | null {
    let mejor: LocalMontado | null = null;
    let mejorD = maxM;
    for (const local of this.locales) {
      const d = local.position.distanceTo(from);
      if (d <= mejorD) {
        mejor = local;
        mejorD = d;
      }
    }
    return mejor;
  }
}
