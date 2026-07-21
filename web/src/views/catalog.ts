import { api, type ListParams, type RouteCard } from "../api.js";
import {
  DIFFICULTY_META,
  ACTIVITY_LABELS,
  fmtDistance,
  fmtElevation,
  esc,
} from "../util.js";

const DIFFICULTIES = ["facil", "moderada", "dificil"] as const;
const ACTIVITIES = [
  "senderismo",
  "bici",
  "auto",
  "cabalgata",
  "mixto",
] as const;

export function renderCatalog(app: HTMLElement): void {
  app.innerHTML = `
    <header class="site-header">
      <a class="brand" href="/" data-link>Esquel Rutas</a>
      <nav>
        <a href="/" data-link>Catálogo</a>
        <a href="/admin" data-link>Admin</a>
      </nav>
    </header>
    <main class="container">
      <div class="catalog-filters">
        <input id="f-q" type="search" placeholder="Buscar rutas…" />
        <select id="f-diff">
          <option value="">Toda dificultad</option>
          ${DIFFICULTIES.map(
            (d) => `<option value="${d}">${DIFFICULTY_META[d].label}</option>`,
          ).join("")}
        </select>
        <select id="f-act">
          <option value="">Toda actividad</option>
          ${ACTIVITIES.map(
            (a) => `<option value="${a}">${ACTIVITY_LABELS[a]}</option>`,
          ).join("")}
        </select>
        <input id="f-region" type="search" placeholder="Región…" />
      </div>
      <div id="results"><div class="loading">Cargando rutas…</div></div>
      <div id="pager" class="pagination"></div>
    </main>
  `;

  const results = app.querySelector<HTMLElement>("#results")!;
  const pager = app.querySelector<HTMLElement>("#pager")!;
  const qInput = app.querySelector<HTMLInputElement>("#f-q")!;
  const diffSel = app.querySelector<HTMLSelectElement>("#f-diff")!;
  const actSel = app.querySelector<HTMLSelectElement>("#f-act")!;
  const regionInput = app.querySelector<HTMLInputElement>("#f-region")!;

  const state: ListParams = { page: 1, limit: 12 };
  let debounce: ReturnType<typeof setTimeout> | undefined;

  async function load(): Promise<void> {
    results.innerHTML = `<div class="loading">Cargando rutas…</div>`;
    try {
      const data = await api.listRoutes(state);
      renderResults(data.items);
      renderPager(data.total, data.page, data.limit);
    } catch (err) {
      results.innerHTML = `<div class="error-box">Error al cargar: ${esc(
        (err as Error).message,
      )}</div>`;
      pager.innerHTML = "";
    }
  }

  function renderResults(items: RouteCard[]): void {
    if (!items.length) {
      results.innerHTML = `<div class="empty">No hay rutas que coincidan con los filtros.</div>`;
      return;
    }
    results.innerHTML = `<div class="grid">${items.map(card).join("")}</div>`;
  }

  function card(r: RouteCard): string {
    const diff = DIFFICULTY_META[r.difficulty];
    const cover = r.coverUrl
      ? `style="background-image:url('${esc(r.coverUrl)}')"`
      : "";
    return `
      <a class="card" href="/r/${esc(r.slug)}" data-link>
        <div class="cover" ${cover}></div>
        <div class="body">
          <div class="meta">
            <span class="badge" style="background:${diff.color}">${diff.label}</span>
            <span class="chip">${ACTIVITY_LABELS[r.activity] ?? r.activity}</span>
            ${r.region ? `<span class="chip">${esc(r.region)}</span>` : ""}
          </div>
          <h3>${esc(r.name)}</h3>
          <p class="summary">${esc(r.summary ?? "")}</p>
          <div class="stats">
            <span>📏 ${fmtDistance(r.distanceM)}</span>
            <span>⛰️ ${fmtElevation(r.ascentM)}</span>
          </div>
        </div>
      </a>`;
  }

  function renderPager(total: number, page: number, limit: number): void {
    const pages = Math.max(1, Math.ceil(total / limit));
    if (pages <= 1) {
      pager.innerHTML = "";
      return;
    }
    pager.innerHTML = "";
    const prev = document.createElement("button");
    prev.textContent = "‹ Anterior";
    prev.disabled = page <= 1;
    prev.onclick = () => {
      state.page = page - 1;
      void load();
    };
    const info = document.createElement("span");
    info.textContent = `Página ${page} de ${pages}`;
    const next = document.createElement("button");
    next.textContent = "Siguiente ›";
    next.disabled = page >= pages;
    next.onclick = () => {
      state.page = page + 1;
      void load();
    };
    pager.append(prev, info, next);
  }

  function applyFilters(resetPage = true): void {
    if (resetPage) state.page = 1;
    state.q = qInput.value.trim() || undefined;
    state.difficulty = (diffSel.value || undefined) as ListParams["difficulty"];
    state.activity = (actSel.value || undefined) as ListParams["activity"];
    state.region = regionInput.value.trim() || undefined;
    void load();
  }

  const onType = (): void => {
    clearTimeout(debounce);
    debounce = setTimeout(() => applyFilters(), 300);
  };
  qInput.addEventListener("input", onType);
  regionInput.addEventListener("input", onType);
  diffSel.addEventListener("change", () => applyFilters());
  actSel.addEventListener("change", () => applyFilters());

  void load();
}
