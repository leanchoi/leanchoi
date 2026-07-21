import { el } from "../util.js";

function fmtTime(s: number): string {
  if (!isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

/**
 * Accessible audio player built on native <audio>.
 * play/pause, seekable progress bar, elapsed/total time, keyboard support.
 */
export function createAudioPlayer(src: string): HTMLElement {
  const audio = new Audio(src);
  audio.preload = "metadata";

  const playBtn = el("button", { className: "play", type: "button" });
  playBtn.setAttribute("aria-label", "Reproducir audioguía");
  playBtn.textContent = "▶";

  const fill = el("div", { className: "fill" });
  const bar = el("div", { className: "bar" }, [fill]);
  bar.setAttribute("role", "slider");
  bar.setAttribute("tabindex", "0");
  bar.setAttribute("aria-label", "Progreso del audio");
  bar.setAttribute("aria-valuemin", "0");

  const time = el("div", { className: "time" }, ["0:00 / 0:00"]);

  const wrap = el("div", { className: "audio-player" }, [playBtn, bar, time]);

  const setPlayIcon = (playing: boolean): void => {
    playBtn.textContent = playing ? "⏸" : "▶";
    playBtn.setAttribute(
      "aria-label",
      playing ? "Pausar audioguía" : "Reproducir audioguía",
    );
  };

  const toggle = (): void => {
    if (audio.paused) void audio.play();
    else audio.pause();
  };

  playBtn.addEventListener("click", toggle);
  audio.addEventListener("play", () => setPlayIcon(true));
  audio.addEventListener("pause", () => setPlayIcon(false));
  audio.addEventListener("ended", () => setPlayIcon(false));

  const update = (): void => {
    const pct = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
    fill.style.width = `${pct}%`;
    time.textContent = `${fmtTime(audio.currentTime)} / ${fmtTime(audio.duration)}`;
    bar.setAttribute("aria-valuemax", String(Math.floor(audio.duration || 0)));
    bar.setAttribute("aria-valuenow", String(Math.floor(audio.currentTime)));
  };
  audio.addEventListener("timeupdate", update);
  audio.addEventListener("loadedmetadata", update);

  const seekTo = (clientX: number): void => {
    const rect = bar.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    if (audio.duration) audio.currentTime = ratio * audio.duration;
  };
  bar.addEventListener("click", (e) => seekTo(e.clientX));

  bar.addEventListener("keydown", (e) => {
    if (!audio.duration) return;
    if (e.key === "ArrowRight") {
      audio.currentTime = Math.min(audio.duration, audio.currentTime + 5);
      e.preventDefault();
    } else if (e.key === "ArrowLeft") {
      audio.currentTime = Math.max(0, audio.currentTime - 5);
      e.preventDefault();
    } else if (e.key === " " || e.key === "Enter") {
      toggle();
      e.preventDefault();
    }
  });

  // Stop playback + free resources when the node is removed from the DOM.
  (wrap as HTMLElement & { destroy?: () => void }).destroy = () => {
    audio.pause();
    audio.src = "";
  };

  return wrap;
}
