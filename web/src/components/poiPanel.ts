import type { Ficha, PoiDTO } from "../api.js";
import { POI_TYPES } from "../poiTypes.js";
import { SOIL_SITUATIONS, SYSTEM_STATES } from "../sistema.js";
import { renderMarkdown, esc, el } from "../util.js";
import { createAudioPlayer } from "./audioPlayer.js";

export interface PoiPanel {
  root: HTMLElement;
  /** Populate the ordered list of POIs. */
  setPois(pois: PoiDTO[]): void;
  /** Render the Sistema de Montaña ficha above the POI list. */
  setFicha(ficha: Ficha | undefined | null): void;
  /** Expand + scroll to a POI (null collapses all). `fromList` fires onSelect. */
  select(poiId: string | null, fromList?: boolean): void;
  show(): void;
  hide(): void;
  toggle(): void;
  isVisible(): boolean;
}

interface PoiPanelHandlers {
  /** User picked a POI from the list (so the map can pan + highlight). */
  onSelect?: (poi: PoiDTO) => void;
  /** Panel shown/hidden — used to invalidate the Leaflet map size. */
  onVisibilityChange?: () => void;
}

type CardEl = HTMLElement & { _destroyAudio?: () => void };

/**
 * Side panel that lists every POI of the route in order (an accordion). By
 * default all POIs are shown collapsed, first→last. Selecting one (from the
 * list or the map) expands it, scrolls it into view and anchors it. Detail
 * order is title → description → audio → video → photo (photo last so a big
 * image never buries the text/audio).
 */
export function createPoiPanel(handlers: PoiPanelHandlers = {}): PoiPanel {
  const title = el("h2", {}, ["Puntos de interés"]);
  const closeBtn = el("button", { type: "button", title: "Ocultar panel" }, ["✕"]);
  closeBtn.setAttribute("aria-label", "Ocultar panel de puntos de interés");
  const head = el("div", { className: "ph-head" }, [title, closeBtn]);

  const fichaBox = el("div", { className: "ph-ficha" });
  const list = el("div", { className: "ph-list" }, [fichaBox]);
  const root = el("div", { className: "poi-panel" }, [head, list]);

  let pois: PoiDTO[] = [];
  const byId = new Map<string, PoiDTO>();
  let activeId: string | null = null;

  closeBtn.addEventListener("click", () => hide());

  function cardFor(id: string): CardEl | null {
    return list.querySelector<CardEl>(`.poi-card[data-id="${CSS.escape(id)}"]`);
  }

  function clearBody(card: CardEl | null): void {
    if (!card) return;
    card._destroyAudio?.();
    card._destroyAudio = undefined;
    const body = card.querySelector(".poi-card-body");
    if (body) body.innerHTML = "";
  }

  function buildBody(card: CardEl, poi: PoiDTO): void {
    const body = card.querySelector<HTMLElement>(".poi-card-body")!;
    body.innerHTML = "";

    // 1) Description (sanitized markdown).
    if (poi.description) {
      const desc = el("div", { className: "poi-desc" });
      desc.innerHTML = renderMarkdown(poi.description);
      body.append(desc);
    }

    // 2) Audioguide (+ optional transcript).
    if (poi.audioUrl) {
      const player = createAudioPlayer(poi.audioUrl) as HTMLElement & {
        destroy?: () => void;
      };
      body.append(player);
      card._destroyAudio = player.destroy;
      if (poi.audioTranscript) {
        const details = el("details", {});
        details.append(
          el("summary", {}, ["Transcripción"]),
          el("div", { className: "hint" }, [poi.audioTranscript]),
        );
        body.append(details);
      }
    }

    // 3) Video (embedded if YouTube/Vimeo).
    if (poi.videoUrl) {
      const embed = toEmbed(poi.videoUrl);
      if (embed) {
        const frame = document.createElement("iframe");
        frame.src = embed;
        frame.width = "100%";
        frame.height = "200";
        frame.style.border = "0";
        frame.style.borderRadius = "8px";
        frame.setAttribute("allowfullscreen", "");
        frame.setAttribute("loading", "lazy");
        body.append(frame);
      } else {
        const a = el("a", { href: poi.videoUrl, target: "_blank" }, ["Ver video"]);
        a.rel = "noopener";
        body.append(a);
      }
    }

    // 4) Photo LAST (so it never pushes the text/audio out of view).
    if (poi.photoUrl) {
      const img = el("img", {
        src: poi.photoUrl,
        alt: poi.name,
        loading: "lazy",
        className: "poi-photo",
      });
      body.append(img);
    }

    if (!body.childElementCount) {
      body.append(el("div", { className: "hint" }, ["Sin material adicional."]));
    }
  }

  function setFicha(ficha: Ficha | undefined | null): void {
    fichaBox.innerHTML = "";
    // Tolerar una API más vieja o una ficha incompleta: sin ficha, el visor
    // sigue funcionando (mapa, track, POIs) y sólo se omite este bloque.
    if (!ficha) return;
    const st = SYSTEM_STATES[ficha.systemState];
    const candidates: [string, string | null][] = [
      ["Nombres alternativos", ficha.altNames],
      ["Acceso y punto de inicio", ficha.accessDescription],
      [
        "Situación del suelo",
        ficha.soilSituation ? SOIL_SITUATIONS[ficha.soilSituation].label : null,
      ],
      ["Usos compatibles", ficha.compatibleUses],
      ["Usos incompatibles", ficha.incompatibleUses],
      ["Estacionalidad y condiciones", ficha.seasonality],
      ["Riesgos conocidos", ficha.risks],
      ["Estado de conservación", ficha.conservationState],
      ["Mantenimiento", ficha.maintainedBy],
      ["Antecedentes", ficha.background],
      ["Aportado por", ficha.contributedBy],
      ["Revisado por", ficha.reviewedBy],
    ];
    const rows: [string, string][] = candidates.filter(
      (entry): entry is [string, string] => !!entry[1],
    );

    if (!rows.length && !st) return;

    const details = el("details", { className: "ficha-public" });
    const summary = el("summary", {}, ["Ficha del circuito"]);
    if (st) {
      const badge = el("span", { className: "badge" }, [st.label]);
      badge.style.background = st.color;
      badge.style.marginLeft = "6px";
      summary.append(badge);
    }
    details.append(summary);

    const dl = el("dl", { className: "ficha-dl" });
    for (const [k, v] of rows) {
      dl.append(el("dt", {}, [k]), el("dd", {}, [v]));
    }
    details.append(dl);
    fichaBox.append(details);
  }

  function setPois(next: PoiDTO[]): void {
    pois = [...next].sort((a, b) => a.orderIndex - b.orderIndex);
    byId.clear();
    for (const p of pois) byId.set(p.id, p);
    activeId = null;
    // Conservar la ficha; limpiar sólo las tarjetas de POI.
    list.querySelectorAll(".poi-card, .hint").forEach((n) => n.remove());

    if (!pois.length) {
      const empty = el("div", { className: "hint" }, [
        "Esta ruta no tiene puntos de interés.",
      ]);
      empty.style.padding = "12px";
      list.append(empty);
      return;
    }

    pois.forEach((poi, i) => {
      const meta = POI_TYPES[poi.type];
      const num = el("span", { className: "poi-num" }, [String(i + 1)]);
      const badge = el("span", { className: "badge" }, [meta.label]);
      badge.style.background = meta.color;
      const name = el("span", { className: "poi-card-name" }, [poi.name]);
      const chevron = el("span", { className: "poi-chevron" }, ["›"]);
      const headRow = el("button", { className: "poi-card-head", type: "button" }, [
        num,
        badge,
        name,
        chevron,
      ]);
      const bodyEl = el("div", { className: "poi-card-body" });
      const card = el("div", { className: "poi-card" }, [headRow, bodyEl]) as CardEl;
      card.dataset.id = poi.id;

      headRow.addEventListener("click", () => {
        if (activeId === poi.id) {
          select(null); // collapse if already open
        } else {
          select(poi.id, true);
        }
      });

      list.append(card);
    });
  }

  function select(poiId: string | null, fromList = false): void {
    // Collapse the previously active card.
    if (activeId) {
      const prev = cardFor(activeId);
      prev?.classList.remove("active");
      clearBody(prev);
    }
    activeId = poiId;
    if (!poiId) return;

    const poi = byId.get(poiId);
    const card = cardFor(poiId);
    if (!poi || !card) return;

    card.classList.add("active");
    buildBody(card, poi);
    show();
    // Anchor: scroll the card to the top of the panel.
    requestAnimationFrame(() =>
      card.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
    if (fromList) handlers.onSelect?.(poi);
  }

  function show(): void {
    if (!root.classList.contains("collapsed")) return;
    root.classList.remove("collapsed");
    handlers.onVisibilityChange?.();
  }
  function hide(): void {
    if (root.classList.contains("collapsed")) return;
    root.classList.add("collapsed");
    handlers.onVisibilityChange?.();
  }
  function toggle(): void {
    if (root.classList.contains("collapsed")) show();
    else hide();
  }

  return {
    root,
    setPois,
    setFicha,
    select,
    show,
    hide,
    toggle,
    isVisible: () => !root.classList.contains("collapsed"),
  };
}

/** Convert a YouTube/Vimeo watch URL into an embeddable URL. */
function toEmbed(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtube.com") && u.searchParams.get("v")) {
      return `https://www.youtube.com/embed/${esc(u.searchParams.get("v")!)}`;
    }
    if (u.hostname === "youtu.be") {
      return `https://www.youtube.com/embed/${esc(u.pathname.slice(1))}`;
    }
    if (u.hostname.includes("vimeo.com")) {
      const id = u.pathname.split("/").filter(Boolean).pop();
      if (id) return `https://player.vimeo.com/video/${esc(id)}`;
    }
  } catch {
    /* ignore */
  }
  return null;
}
