import Swiper from "swiper";
import "swiper/css";
import type { PoiDTO } from "../api.js";
import { POI_TYPES } from "../poiTypes.js";
import { renderMarkdown, esc, el } from "../util.js";
import { createAudioPlayer } from "./audioPlayer.js";

export interface PoiPanel {
  root: HTMLElement;
  show(poi: PoiDTO): void;
  hide(): void;
}

/**
 * Side/bottom panel showing a POI's details: title, sanitized markdown
 * description, photo gallery (Swiper), audioguide player and optional video.
 */
export function createPoiPanel(onClose: () => void): PoiPanel {
  const title = el("h2", {});
  const typeChip = el("span", { className: "chip" });
  const closeBtn = el("button", { type: "button" }, ["✕"]);
  closeBtn.setAttribute("aria-label", "Cerrar panel");

  const head = el("div", { className: "ph-head" }, [typeChip, title, closeBtn]);
  const body = el("div", { className: "ph-body" });
  const root = el("div", { className: "poi-panel hidden" }, [head, body]);

  let currentAudio: (HTMLElement & { destroy?: () => void }) | null = null;

  closeBtn.addEventListener("click", () => {
    hide();
    onClose();
  });

  function hide(): void {
    if (currentAudio?.destroy) currentAudio.destroy();
    currentAudio = null;
    root.classList.add("hidden");
  }

  function show(poi: PoiDTO): void {
    if (currentAudio?.destroy) currentAudio.destroy();
    currentAudio = null;
    body.innerHTML = "";

    const meta = POI_TYPES[poi.type];
    title.textContent = poi.name;
    typeChip.textContent = meta.label;
    typeChip.style.background = meta.color;
    typeChip.style.color = "#fff";

    // Gallery (Swiper) — single photo today, ready for multiple.
    if (poi.photoUrl) {
      const slidesWrap = el("div", { className: "swiper-wrapper" });
      for (const url of [poi.photoUrl]) {
        const slide = el("div", { className: "swiper-slide" }, [
          el("img", { src: url, alt: poi.name, loading: "lazy" }),
        ]);
        slidesWrap.append(slide);
      }
      const swiperEl = el("div", { className: "swiper" }, [slidesWrap]);
      const gallery = el("div", { className: "gallery" }, [swiperEl]);
      body.append(gallery);
      // Init after it's in the DOM.
      new Swiper(swiperEl, { loop: false });
    }

    // Description (sanitized markdown).
    if (poi.description) {
      const desc = el("div", { className: "poi-desc" });
      desc.innerHTML = renderMarkdown(poi.description);
      body.append(desc);
    }

    // Audioguide.
    if (poi.audioUrl) {
      const player = createAudioPlayer(poi.audioUrl) as HTMLElement & {
        destroy?: () => void;
      };
      currentAudio = player;
      body.append(player);
      if (poi.audioTranscript) {
        const details = el("details", {});
        details.append(
          el("summary", {}, ["Transcripción"]),
          el("div", { className: "hint" }, [poi.audioTranscript]),
        );
        body.append(details);
      }
    }

    // Optional embedded video.
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
        const a = el("a", { href: poi.videoUrl, target: "_blank" }, [
          "Ver video",
        ]);
        a.rel = "noopener";
        body.append(a);
      }
    }

    root.classList.remove("hidden");
    root.scrollTop = 0;
  }

  return { root, show, hide };
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
