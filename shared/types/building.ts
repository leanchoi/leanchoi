/**
 * Esquel 2027 — Pipeline de Fachadas Modulares.
 *
 * El mundo arranca 100% procedimental: cada parcela recibe un edificio genérico
 * derivado de su celda y su uso de suelo. Cuando un vecino aporta fotos de una
 * fachada real con su dirección, el pipeline produce un `BuildingPrefabMeta` que
 * REEMPLAZA al genérico sin tocar la cuadrícula: mismo `parcelId`, mismo
 * footprint, misma línea municipal. Ese es el contrato inamovible.
 *
 * Este tipo es el espejo TypeScript de
 * `/shared/schemas/building-prefab.schema.json`. Ambos DEBEN mutar juntos:
 * `npm run validate:schemas` falla si divergen.
 */

import type { Aabb, Barrio, GridCell, IsoDateTime, LatLon, ParcelId, PrefabId, Vec3 } from './common.ts';

/** Fuente de la geometría del prefab. */
export const PREFAB_SOURCES = ['procedural', 'voxel_json', 'gltf', 'hybrid'] as const;
export type PrefabSource = (typeof PREFAB_SOURCES)[number];

/** Uso de suelo: dirige el generador procedimental y el comportamiento in-game. */
export const LAND_USES = [
  'residencial',
  'comercial',
  'gastronomico',
  'institucional',
  'educativo',
  'salud',
  'religioso',
  'hotelero',
  'industrial',
  'baldio',
  'plaza',
  'ferroviario',
] as const;
export type LandUse = (typeof LAND_USES)[number];

/** Calles reconocidas del casco céntrico (extensible por celda). */
export const KNOWN_STREETS = [
  'av_alvear',
  '25_de_mayo',
  '9_de_julio',
  'san_martin',
  'fontana',
  'rivadavia',
  'mitre',
  'sarmiento',
  'belgrano',
  'roca',
  'irigoyen',
  'chacabuco',
  'ameghino',
  'otra',
] as const;
export type KnownStreet = (typeof KNOWN_STREETS)[number];

/** Dirección real, tal como la carga el vecino. */
export interface RealAddress {
  readonly street: KnownStreet;
  /** Nombre exacto tipeado, cuando `street === 'otra'`. */
  readonly streetLabel?: string;
  /** Altura catastral. `0` para esquinas sin numeración. */
  readonly number: number;
  /** Piso/depto/local, si aplica. */
  readonly unit?: string;
  readonly barrio: Barrio;
  readonly city: 'Esquel';
  readonly province: 'Chubut';
  readonly country: 'AR';
  /** Código postal (9200 en Esquel). */
  readonly postalCode: string;
}

/** Anclaje del prefab en la grilla del mundo. */
export interface PrefabPlacement {
  readonly parcelId: ParcelId;
  readonly cell: GridCell;
  /** Índice de la parcela dentro de la manzana (0..N, sentido horario desde el NO). */
  readonly parcelIndex: number;
  /** Origen local del prefab en coordenadas de mundo (esquina inferior-frontal-izquierda). */
  readonly origin: Vec3;
  /** Rotación en el plano XZ; sólo múltiplos de 90° para respetar la línea municipal. */
  readonly yawDeg: 0 | 90 | 180 | 270;
  /** Frente sobre la línea municipal, en metros. */
  readonly frontageM: number;
  /** Profundidad edificada, en metros. */
  readonly depthM: number;
  /** Coordenada geográfica del centro del frente (documental/validación). */
  readonly geo?: LatLon;
  /** Retiro respecto de la línea municipal, en metros. */
  readonly setbackM: number;
}

/** Volumen voxelizado del prefab. */
export interface PrefabVolume {
  /** Dimensiones en voxels `[ancho(X), alto(Y), profundidad(Z)]`. */
  readonly size: readonly [number, number, number];
  /** Cantidad de plantas, para el generador de interiores y de ventanas. */
  readonly floors: number;
  /** Altura de planta en metros. */
  readonly floorHeightM: number;
  /** Caja de colisión (puede ser menor que el volumen visual: aleros, carteles). */
  readonly collision: Aabb;
  /** `true` si el edificio tiene interior navegable en esta versión. */
  readonly hasInterior: boolean;
}

/** Paleta de bloques: mapea índices de la geometría a materiales del atlas. */
export interface PrefabPalette {
  /** Índice 0 SIEMPRE es aire. */
  readonly entries: readonly {
    readonly index: number;
    /** Slug del material en `/client/src/assets/materials.json`. */
    readonly material: string;
    /** Tinte `#RRGGBB` aplicado sobre la textura base. */
    readonly tint?: string;
    /** Emisión [0,1]: carteles, vidrieras de noche. */
    readonly emissive?: number;
    /** Rugosidad [0,1] para el PBR simplificado. */
    readonly roughness?: number;
  }[];
}

/** Geometría voxel embebida o referenciada. */
export interface PrefabGeometry {
  readonly source: PrefabSource;
  /** Ruta al `.glb` o `.vox.json` en el CDN (`/cdn/prefabs/<id>/<lod>.glb`). */
  readonly asset?: string;
  /** Niveles de detalle disponibles, de mayor a menor. */
  readonly lods: readonly {
    readonly level: 0 | 1 | 2;
    readonly asset: string;
    /** Distancia en metros a partir de la cual se usa este LOD. */
    readonly minDistanceM: number;
    readonly triangles: number;
  }[];
  /** Voxels RLE embebidos para prefabs livianos (`[paletteIndex, count]`). */
  readonly rle?: readonly (readonly [number, number])[];
  readonly palette: PrefabPalette;
  /** Hash SHA-256 del asset principal, para caché y auditoría. */
  readonly assetHash?: string;
  /** Peso del asset principal en bytes (presupuesto: <= 512 KB por prefab LOD0). */
  readonly assetBytes?: number;
}

/** Anclajes funcionales del edificio. */
export interface PrefabAnchors {
  /** Puerta principal: punto de entrada/teleport a interior. */
  readonly door?: { readonly position: Vec3; readonly yawDeg: number };
  /** Anclajes de marquesina/cartel (hasta 4). */
  readonly signs: readonly {
    readonly id: string;
    readonly position: Vec3;
    readonly yawDeg: number;
    /** Tamaño del plano del cartel en metros `[ancho, alto]`. */
    readonly sizeM: readonly [number, number];
    /** Textura por defecto si no hay sponsor asignado. */
    readonly defaultTexture?: string;
  }[];
  /** Punto de spawn de NPC asociado (vendedor, portero). */
  readonly npcSpawn?: Vec3;
  /** Superficies válidas para pegar afiches (misión `afiches_relampago`). */
  readonly posterSlots: readonly { readonly id: string; readonly position: Vec3; readonly yawDeg: number }[];
}

/** Trazabilidad y permisos de la contribución fotográfica. */
export interface PrefabProvenance {
  /** Usuario que aportó las fotos (`usuarios.id` como string; nunca se publica). */
  readonly contributorUserId?: string;
  /** URLs de las fotos fuente en almacenamiento privado de Hostinger. */
  readonly photos: readonly {
    readonly url: string;
    readonly takenAt?: IsoDateTime;
    /** Orientación respecto de la fachada. */
    readonly facing: 'frente' | 'lateral_izq' | 'lateral_der' | 'detalle';
    /** `true` si se aplicó difuminado de personas/patentes antes de guardar. */
    readonly anonymized: boolean;
  }[];
  /** Declaración de derechos de uso de la imagen. */
  readonly license: 'cc_by_sa' | 'cesion_al_proyecto' | 'uso_autorizado_comercio';
  /** Consentimiento explícito del titular del comercio, si el frente es comercial. */
  readonly ownerConsent: boolean;
  readonly submittedAt: IsoDateTime;
}

/** Estado de revisión: nada entra al mundo sin aprobación humana. */
export const PREFAB_REVIEW_STATES = ['borrador', 'en_revision', 'aprobado', 'rechazado', 'retirado'] as const;
export type PrefabReviewState = (typeof PREFAB_REVIEW_STATES)[number];

/** Metadatos completos de un prefab de edificio. */
export interface BuildingPrefabMeta {
  /** `prefab:` + slug estable. Inmutable a lo largo de las versiones. */
  readonly prefabId: PrefabId;
  /** Versión entera incremental; el cliente cachea por `prefabId@version`. */
  readonly version: number;
  /** Versión del esquema JSON con el que se validó. */
  readonly schemaVersion: 1;

  readonly displayName: string;
  readonly address: RealAddress;
  readonly landUse: LandUse;
  readonly placement: PrefabPlacement;
  readonly volume: PrefabVolume;
  readonly geometry: PrefabGeometry;
  readonly anchors: PrefabAnchors;

  /** Punto de interés del lore local (`poi:la-trochita`, `poi:municipalidad`). */
  readonly poiId?: string;
  /** Comercio patrocinador asignado a este edificio, si lo hay. */
  readonly sponsorId?: number;
  /** Etiquetas para búsquedas y para el generador de misiones. */
  readonly tags: readonly string[];
  /** Hito protegido: no puede ser reemplazado por contribuciones de la comunidad. */
  readonly landmark: boolean;

  readonly provenance?: PrefabProvenance;
  readonly review: {
    readonly state: PrefabReviewState;
    readonly reviewedAt?: IsoDateTime;
    readonly reviewerUserId?: string;
    readonly notes?: string;
  };

  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
  /** `true` si es el prefab activo para su parcela (uno solo por parcela). */
  readonly active: boolean;
  /** Prefab genérico al que reemplaza (para poder revertir). */
  readonly replaces?: PrefabId;
}

/** Índice liviano que el cliente descarga al entrar al shard (< 200 KB). */
export interface PrefabIndexEntry {
  readonly prefabId: PrefabId;
  readonly version: number;
  readonly parcelId: ParcelId;
  readonly cell: GridCell;
  readonly origin: Vec3;
  readonly yawDeg: number;
  readonly lod0: string;
  readonly landUse: LandUse;
  readonly sponsorId?: number;
}

/** Payload de contribución (`POST /api/v1/prefabs/contributions`). */
export interface PrefabContributionRequest {
  readonly address: RealAddress;
  readonly landUse: LandUse;
  /** Fotos ya subidas (ids devueltos por `/uploads`). */
  readonly photoIds: readonly string[];
  readonly license: PrefabProvenance['license'];
  readonly ownerConsent: boolean;
  readonly notes?: string;
}
