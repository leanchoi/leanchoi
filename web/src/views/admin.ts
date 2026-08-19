import L from "leaflet";
import {
  adminApi,
  type AdminApi,
  type AdminPoi,
  type AdminRoute,
} from "../api.js";
import { loadTrack } from "../track.js";
import { POI_TYPE_LIST, POI_TYPES } from "../poiTypes.js";
import {
  SOIL_SITUATION_LIST,
  SOIL_SITUATIONS,
  SYSTEM_STATE_LIST,
  SYSTEM_STATES,
} from "../sistema.js";
import {
  slugify,
  esc,
  renderMarkdown,
  fmtDistance,
  fmtElevation,
} from "../util.js";

// In-memory token only (never persisted to localStorage per spec).
let token: string | null = null;

const DIFFS = ["facil", "moderada", "dificil"] as const;
const ACTS = ["senderismo", "bici", "auto", "cabalgata", "mixto"] as const;

export function renderAdmin(app: HTMLElement): () => void {
  let cleanupMap: (() => void) | null = null;

  app.innerHTML = `
    <header class="site-header">
      <a class="brand" href="/" data-link>
        <img src="/logo.svg" alt="YATEN" height="34" />
      </a>
      <nav><a href="/" data-link>Circuitos</a><span>Admin</span></nav>
    </header>
    <div id="admin-root"></div>
  `;
  const root = app.querySelector<HTMLElement>("#admin-root")!;

  function showGate(message?: string): void {
    root.innerHTML = `
      <div class="admin-gate">
        <h2>Panel de administración</h2>
        <p class="hint">Pegá el <code>ADMIN_TOKEN</code> configurado en el servidor.</p>
        ${message ? `<div class="error-box">${esc(message)}</div>` : ""}
        <div class="field">
          <label for="tok">Token</label>
          <input id="tok" type="password" placeholder="Bearer token…" />
        </div>
        <button class="primary" id="tok-go">Entrar</button>
      </div>`;
    const input = root.querySelector<HTMLInputElement>("#tok")!;
    const go = root.querySelector<HTMLButtonElement>("#tok-go")!;
    const submit = async (): Promise<void> => {
      const t = input.value.trim();
      if (!t) return;
      go.disabled = true;
      try {
        await adminApi(t).listRoutes();
        token = t;
        void showDashboard();
      } catch {
        go.disabled = false;
        showGate("Token inválido.");
      }
    };
    go.onclick = () => void submit();
    input.onkeydown = (e) => {
      if (e.key === "Enter") void submit();
    };
    input.focus();
  }

  async function showDashboard(selectedId?: string): Promise<void> {
    if (!token) return showGate();
    const client = adminApi(token);
    root.innerHTML = `
      <div class="admin-wrap">
        <aside class="admin-side">
          <div class="toolbar">
            <button class="primary" id="new-route">+ Nueva ruta</button>
          </div>
          <div id="route-list"><div class="loading">Cargando…</div></div>
        </aside>
        <main class="admin-main" id="editor">
          <div class="empty">Seleccioná o creá una ruta.</div>
        </main>
      </div>`;

    const listEl = root.querySelector<HTMLElement>("#route-list")!;
    const editorEl = root.querySelector<HTMLElement>("#editor")!;
    root.querySelector<HTMLButtonElement>("#new-route")!.onclick = () =>
      openRouteForm(client, editorEl, null, () => void showDashboard());

    let routes: AdminRoute[] = [];
    try {
      routes = (await client.listRoutes()).items;
    } catch {
      token = null;
      return showGate("Sesión expirada.");
    }

    listEl.innerHTML = "";
    if (!routes.length) {
      listEl.innerHTML = `<p class="hint">No hay rutas todavía.</p>`;
    }
    for (const r of routes) {
      const item = document.createElement("div");
      item.className =
        "route-list-item" + (r.id === selectedId ? " active" : "");
      const st = SYSTEM_STATES[r.systemState];
      const stLabel = st?.label ?? r.systemState ?? "—";
      item.innerHTML = `
        <span class="name">${esc(r.name)}</span>
        <span class="badge" title="${esc(stLabel)}"
          style="background:${st?.color ?? "#6b7280"}">${esc(
            stLabel.split(" ")[0],
          )}</span>
        <span class="badge" style="background:${
          r.status === "published" ? "#16a34a" : "#9ca3af"
        }">${r.status === "published" ? "pub" : "draft"}</span>`;
      item.onclick = () => void openRoute(client, editorEl, r.id);
      listEl.append(item);
    }

    if (selectedId) void openRoute(client, editorEl, selectedId);
  }

  // ─── Route detail / editor ──────────────────────────────────
  async function openRoute(
    client: AdminApi,
    editorEl: HTMLElement,
    id: string,
  ): Promise<void> {
    if (cleanupMap) {
      cleanupMap();
      cleanupMap = null;
    }
    editorEl.innerHTML = `<div class="loading">Cargando ruta…</div>`;
    const { route, pois } = await client.getRoute(id);

    const stMeta = SYSTEM_STATES[route.systemState];
    const canPublish = stMeta?.publishable ?? false;
    editorEl.innerHTML = `
      <div class="toolbar">
        <strong style="font-size:18px">${esc(route.name)}</strong>
        <span class="badge" style="background:${stMeta?.color ?? "#6b7280"}">${esc(
          stMeta?.label ?? route.systemState,
        )}</span>
        <span class="badge" style="background:${
          route.status === "published" ? "#16a34a" : "#9ca3af"
        }">${route.status}</span>
        <div style="margin-left:auto; display:flex; gap:8px">
          <button id="btn-edit">Editar ficha</button>
          <button id="btn-pub" class="primary" ${
            route.status !== "published" && !canPublish ? "disabled" : ""
          } title="${
            route.status !== "published" && !canPublish
              ? "Sólo se publica lo que está en estado publicable"
              : ""
          }">${route.status === "published" ? "Despublicar" : "Publicar"}</button>
          <button id="btn-del" class="danger">Eliminar</button>
        </div>
      </div>
      ${
        route.status !== "published" && !canPublish
          ? `<div class="hint" style="margin:-8px 0 12px">Este circuito está
             <strong>${esc(stMeta?.label ?? route.systemState)}</strong>:
             consta en el inventario pero no se publica. ${esc(stMeta?.help ?? "")}</div>`
          : ""
      }
      <div class="stats" style="margin-bottom:12px">
        <span>📏 ${fmtDistance(route.distanceM ?? 0)}</span>
        <span>⬆ ${fmtElevation(route.ascentM ?? 0)}</span>
        <span>⬇ ${fmtElevation(route.descentM ?? 0)}</span>
      </div>

      <div class="section-title">GPX</div>
      <div class="field">
        <input type="file" id="gpx-file" accept=".gpx,application/gpx+xml" />
        <div class="hint" id="gpx-status">${
          route.gpxPath
            ? "GPX cargado. Subí otro para reemplazar."
            : "Sin GPX. Subí un archivo para calcular distancia y desnivel."
        }</div>
      </div>

      <div class="section-title">Puntos de interés</div>
      <p class="hint">Hacé click en el mapa para agregar un POI. Arrastrá los markers para reposicionar.</p>
      <div id="admin-map"></div>
      <div id="poi-form-host"></div>
      <div class="section-title">Orden de POIs (arrastrá para reordenar)</div>
      <div id="poi-list"></div>
    `;

    // Publish toggle
    editorEl.querySelector<HTMLButtonElement>("#btn-pub")!.onclick =
      async () => {
        try {
          if (route.status === "published") await client.unpublish(id);
          else await client.publish(id);
          void showDashboard(id);
        } catch (err) {
          alert((err as Error).message);
        }
      };
    editorEl.querySelector<HTMLButtonElement>("#btn-edit")!.onclick = () =>
      openRouteForm(client, editorEl, route, () => void openRoute(client, editorEl, id));
    editorEl.querySelector<HTMLButtonElement>("#btn-del")!.onclick =
      async () => {
        if (!confirm(`¿Eliminar la ruta "${route.name}"?`)) return;
        await client.deleteRoute(id);
        void showDashboard();
      };

    // GPX upload
    const gpxInput = editorEl.querySelector<HTMLInputElement>("#gpx-file")!;
    const gpxStatus = editorEl.querySelector<HTMLElement>("#gpx-status")!;
    gpxInput.onchange = async () => {
      const file = gpxInput.files?.[0];
      if (!file) return;
      gpxStatus.textContent = "Procesando GPX…";
      try {
        const res = await client.uploadGpx(id, file);
        const s = res.route;
        gpxStatus.textContent = `OK: ${fmtDistance(
          s.distanceM ?? 0,
        )}, ⬆${s.ascentM ?? 0}m / ⬇${s.descentM ?? 0}m`;
        setTimeout(() => void openRoute(client, editorEl, id), 700);
      } catch (err) {
        gpxStatus.innerHTML = `<span style="color:#dc2626">${esc(
          (err as Error).message,
        )}</span>`;
      }
    };

    setupPoiMap(client, editorEl, route, pois);
  }

  // ─── POI map + list ─────────────────────────────────────────
  function setupPoiMap(
    client: AdminApi,
    editorEl: HTMLElement,
    route: AdminRoute,
    pois: AdminPoi[],
  ): void {
    const center: [number, number] =
      route.centerLat != null && route.centerLng != null
        ? [route.centerLat, route.centerLng]
        : [-42.91, -71.31];

    const map = L.map(editorEl.querySelector<HTMLElement>("#admin-map")!).setView(
      center,
      12,
    );
    L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
      maxZoom: 17,
      attribution:
        '© <a href="https://opentopomap.org">OpenTopoMap</a> · © OpenStreetMap',
    }).addTo(map);

    if (
      route.minLat != null &&
      route.minLng != null &&
      route.maxLat != null &&
      route.maxLng != null
    ) {
      map.fitBounds([
        [route.minLat, route.minLng],
        [route.maxLat, route.maxLng],
      ]);
    }
    cleanupMap = () => map.remove();

    // Draw the GPX track so POIs can be placed relative to the route.
    if (route.gpxPath) {
      void loadTrack(`/files/${route.gpxPath}`)
        .then((points) => {
          if (points.length < 2) return;
          L.polyline(
            points.map((p) => [p.lat, p.lng] as [number, number]),
            { color: "#e11d48", weight: 4, opacity: 0.85, lineJoin: "round" },
          ).addTo(map);
        })
        .catch((err) => console.error("No se pudo dibujar el track:", err));
    }

    const markerById = new Map<string, L.Marker>();
    const listEl = editorEl.querySelector<HTMLElement>("#poi-list")!;
    const formHost = editorEl.querySelector<HTMLElement>("#poi-form-host")!;

    const iconFor = (type: string): L.Icon =>
      L.icon({
        iconUrl: `/icons/${type}.svg`,
        iconSize: [34, 46],
        iconAnchor: [17, 46],
        className: "poi-marker",
      });

    const refresh = async (): Promise<void> => {
      const { pois: fresh } = await client.getRoute(route.id);
      drawMarkers(fresh);
      drawList(fresh);
    };

    function drawMarkers(list: AdminPoi[]): void {
      for (const m of markerById.values()) map.removeLayer(m);
      markerById.clear();
      for (const poi of list) {
        const marker = L.marker([poi.lat, poi.lng], {
          icon: iconFor(poi.type),
          draggable: true,
          opacity: poi.hidden ? 0.5 : 1,
        }).addTo(map);
        marker.on("dragend", async () => {
          const ll = marker.getLatLng();
          await client.updatePoi(poi.id, { lat: ll.lat, lng: ll.lng });
        });
        marker.on("click", () =>
          openPoiForm(client, formHost, route.id, poi, refresh),
        );
        markerById.set(poi.id, marker);
      }
    }

    function drawList(list: AdminPoi[]): void {
      listEl.innerHTML = "";
      const ordered = [...list].sort((a, b) => a.orderIndex - b.orderIndex);
      ordered.forEach((poi) => {
        const row = document.createElement("div");
        row.className = "poi-row";
        row.draggable = true;
        row.dataset.id = poi.id;
        row.innerHTML = `
          <span class="handle">⠿</span>
          <span class="badge" style="background:${POI_TYPES[poi.type].color}">${
            POI_TYPES[poi.type].label
          }</span>
          <span class="pname">${esc(poi.name)}${
            poi.hidden ? " (oculto)" : ""
          }</span>
          <button data-act="edit">✎</button>
          <button data-act="hide">${poi.hidden ? "👁" : "🚫"}</button>
          <button data-act="del" class="danger">✕</button>`;
        row.querySelector<HTMLButtonElement>('[data-act="edit"]')!.onclick =
          () => openPoiForm(client, formHost, route.id, poi, refresh);
        row.querySelector<HTMLButtonElement>('[data-act="hide"]')!.onclick =
          async () => {
            await client.updatePoi(poi.id, { hidden: !poi.hidden });
            void refresh();
          };
        row.querySelector<HTMLButtonElement>('[data-act="del"]')!.onclick =
          async () => {
            if (!confirm(`¿Eliminar POI "${poi.name}"?`)) return;
            await client.deletePoi(poi.id);
            void refresh();
          };
        attachDrag(row, listEl, ordered, client, refresh);
        listEl.append(row);
      });
    }

    // Click on map -> new POI at that location.
    map.on("click", (e: L.LeafletMouseEvent) => {
      openPoiForm(
        client,
        formHost,
        route.id,
        { lat: e.latlng.lat, lng: e.latlng.lng },
        refresh,
      );
    });

    drawMarkers(pois);
    drawList(pois);
  }

  showGate();
  return () => {
    if (cleanupMap) cleanupMap();
  };
}

// ─── Drag-reorder for the POI list ────────────────────────────
let dragSrc: HTMLElement | null = null;
function attachDrag(
  row: HTMLElement,
  listEl: HTMLElement,
  _ordered: AdminPoi[],
  client: AdminApi,
  refresh: () => Promise<void>,
): void {
  row.addEventListener("dragstart", () => {
    dragSrc = row;
    row.classList.add("dragging");
  });
  row.addEventListener("dragend", () => row.classList.remove("dragging"));
  row.addEventListener("dragover", (e) => {
    e.preventDefault();
    const after = e.clientY > row.getBoundingClientRect().top + row.offsetHeight / 2;
    if (dragSrc && dragSrc !== row) {
      row.parentElement!.insertBefore(dragSrc, after ? row.nextSibling : row);
    }
  });
  row.addEventListener("drop", async (e) => {
    e.preventDefault();
    const ids = Array.from(listEl.querySelectorAll<HTMLElement>(".poi-row")).map(
      (r) => r.dataset.id!,
    );
    await client.reorderPois(ids.map((id, i) => ({ id, orderIndex: i })));
    void refresh();
  });
}

// ─── Route create/edit form ───────────────────────────────────
function openRouteForm(
  client: AdminApi,
  editorEl: HTMLElement,
  route: AdminRoute | null,
  onDone: () => void,
): void {
  const r = route;
  editorEl.innerHTML = `
    <h2>${r ? "Editar ruta" : "Nueva ruta"}</h2>
    <div class="row">
      <div class="field"><label>Nombre</label><input id="r-name" value="${esc(
        r?.name ?? "",
      )}" /></div>
      <div class="field"><label>Slug</label><input id="r-slug" value="${esc(
        r?.slug ?? "",
      )}" /></div>
    </div>
    <div class="field"><label>Resumen (tarjeta)</label><input id="r-summary" value="${esc(
      r?.summary ?? "",
    )}" /></div>
    <div class="field">
      <label>Descripción (Markdown)</label>
      <textarea id="r-desc">${esc(r?.description ?? "")}</textarea>
      <div class="md-preview" id="r-preview"></div>
    </div>
    <div class="row">
      <div class="field"><label>Dificultad</label><select id="r-diff">${DIFFS.map(
        (d) =>
          `<option value="${d}" ${
            r?.difficulty === d ? "selected" : ""
          }>${d}</option>`,
      ).join("")}</select></div>
      <div class="field"><label>Actividad</label><select id="r-act">${ACTS.map(
        (a) =>
          `<option value="${a}" ${
            r?.activity === a ? "selected" : ""
          }>${a}</option>`,
      ).join("")}</select></div>
    </div>
    <div class="row">
      <div class="field"><label>Región</label><input id="r-region" value="${esc(
        r?.region ?? "",
      )}" /></div>
      <div class="field"><label>Provincia</label><input id="r-prov" value="${esc(
        r?.province ?? "",
      )}" /></div>
      <div class="field"><label>Duración (min)</label><input id="r-dur" type="number" value="${
        r?.durationMin ?? ""
      }" /></div>
    </div>
    <div class="field"><label>Portada (cover)</label><input type="file" id="r-cover" accept="image/*" />
      <div class="hint" id="r-cover-status">${
        r?.coverPath ? "Cover cargada." : ""
      }</div></div>

    <details class="ficha-block" open>
      <summary>Ficha del Sistema de Montaña</summary>
      <p class="hint">Campos de la ficha mínima del inventario. El estado define
      si el circuito puede publicarse: sólo se publica lo que está
      <strong>publicable</strong>.</p>
      <div class="row">
        <div class="field"><label>Estado dentro del Sistema</label>
          <select id="r-state">${SYSTEM_STATE_LIST.map(
            (s) =>
              `<option value="${s}" ${
                (r?.systemState ?? "relevado") === s ? "selected" : ""
              }>${SYSTEM_STATES[s].label}</option>`,
          ).join("")}</select>
          <div class="hint" id="r-state-help"></div>
        </div>
        <div class="field"><label>Situación del suelo</label>
          <select id="r-soil">
            <option value="">— sin definir —</option>
            ${SOIL_SITUATION_LIST.map(
              (s) =>
                `<option value="${s}" ${
                  r?.soilSituation === s ? "selected" : ""
                }>${SOIL_SITUATIONS[s].label}</option>`,
            ).join("")}
          </select>
          <div class="hint" id="r-soil-help"></div>
        </div>
      </div>
      <div class="field"><label>Nombres alternativos</label><input id="f-alt" value="${esc(
        r?.altNames ?? "",
      )}" placeholder="Otros nombres con que se conoce el circuito" /></div>
      <div class="field"><label>Punto de inicio y acceso</label><textarea id="f-access">${esc(
        r?.accessDescription ?? "",
      )}</textarea></div>
      <div class="row">
        <div class="field"><label>Usos compatibles</label><textarea id="f-uses-ok">${esc(
          r?.compatibleUses ?? "",
        )}</textarea></div>
        <div class="field"><label>Usos incompatibles (y por qué)</label><textarea id="f-uses-no">${esc(
          r?.incompatibleUses ?? "",
        )}</textarea></div>
      </div>
      <div class="row">
        <div class="field"><label>Estacionalidad y condiciones</label><textarea id="f-season">${esc(
          r?.seasonality ?? "",
        )}</textarea></div>
        <div class="field"><label>Riesgos conocidos</label><textarea id="f-risks">${esc(
          r?.risks ?? "",
        )}</textarea></div>
      </div>
      <div class="row">
        <div class="field"><label>Estado de conservación</label><input id="f-cons" value="${esc(
          r?.conservationState ?? "",
        )}" /></div>
        <div class="field"><label>Quién realiza mantenimiento</label><input id="f-maint" value="${esc(
          r?.maintainedBy ?? "",
        )}" /></div>
      </div>
      <div class="field"><label>Antecedentes (apertura, uso histórico, valor cultural o deportivo)</label><textarea id="f-bg">${esc(
        r?.background ?? "",
      )}</textarea></div>
      <div class="row">
        <div class="field"><label>Quién lo aporta</label><input id="f-by" value="${esc(
          r?.contributedBy ?? "",
        )}" /></div>
        <div class="field"><label>Quién lo revisó</label><input id="f-rev" value="${esc(
          r?.reviewedBy ?? "",
        )}" /></div>
      </div>
      <div class="field"><label>Notas internas de gestión (no se publican)</label><textarea id="f-notes">${esc(
        r?.managementNotes ?? "",
      )}</textarea></div>
    </details>

    <div class="toolbar">
      <button class="primary" id="r-save">Guardar</button>
      <button id="r-cancel">Cancelar</button>
      <span class="hint" id="r-err"></span>
    </div>`;

  const nameEl = editorEl.querySelector<HTMLInputElement>("#r-name")!;
  const slugEl = editorEl.querySelector<HTMLInputElement>("#r-slug")!;
  const descEl = editorEl.querySelector<HTMLTextAreaElement>("#r-desc")!;
  const preview = editorEl.querySelector<HTMLElement>("#r-preview")!;
  const errEl = editorEl.querySelector<HTMLElement>("#r-err")!;
  const coverInput = editorEl.querySelector<HTMLInputElement>("#r-cover")!;
  const coverStatus = editorEl.querySelector<HTMLElement>("#r-cover-status")!;

  let slugTouched = !!r;
  slugEl.addEventListener("input", () => (slugTouched = true));
  nameEl.addEventListener("input", () => {
    if (!slugTouched) slugEl.value = slugify(nameEl.value);
  });
  const updatePreview = (): void => {
    preview.innerHTML = renderMarkdown(descEl.value);
  };
  descEl.addEventListener("input", updatePreview);
  updatePreview();

  let coverPath: string | null | undefined = r?.coverPath ?? undefined;
  coverInput.onchange = async () => {
    const file = coverInput.files?.[0];
    if (!file) return;
    coverStatus.textContent = "Subiendo…";
    try {
      const res = await client.upload("cover", file);
      coverPath = res.path;
      coverStatus.textContent = "Cover cargada ✓";
    } catch (err) {
      coverStatus.textContent = (err as Error).message;
    }
  };

  // Ayuda contextual de los selectores de la ficha.
  const stateSel = editorEl.querySelector<HTMLSelectElement>("#r-state")!;
  const stateHelp = editorEl.querySelector<HTMLElement>("#r-state-help")!;
  const soilSel = editorEl.querySelector<HTMLSelectElement>("#r-soil")!;
  const soilHelp = editorEl.querySelector<HTMLElement>("#r-soil-help")!;
  const syncHelp = (): void => {
    const st = stateSel.value as keyof typeof SYSTEM_STATES;
    stateHelp.textContent = SYSTEM_STATES[st]?.help ?? "";
    const so = soilSel.value as keyof typeof SOIL_SITUATIONS;
    soilHelp.textContent = so ? (SOIL_SITUATIONS[so]?.publishRule ?? "") : "";
  };
  stateSel.addEventListener("change", syncHelp);
  soilSel.addEventListener("change", syncHelp);
  syncHelp();

  const val = (sel: string): string =>
    editorEl.querySelector<HTMLInputElement | HTMLTextAreaElement>(sel)!.value.trim();

  editorEl.querySelector<HTMLButtonElement>("#r-cancel")!.onclick = onDone;
  editorEl.querySelector<HTMLButtonElement>("#r-save")!.onclick = async () => {
    errEl.textContent = "";
    const durVal = editorEl.querySelector<HTMLInputElement>("#r-dur")!.value;
    const body: Record<string, unknown> = {
      systemState: stateSel.value,
      soilSituation: soilSel.value || null,
      altNames: val("#f-alt") || null,
      accessDescription: val("#f-access") || null,
      compatibleUses: val("#f-uses-ok") || null,
      incompatibleUses: val("#f-uses-no") || null,
      seasonality: val("#f-season") || null,
      risks: val("#f-risks") || null,
      conservationState: val("#f-cons") || null,
      maintainedBy: val("#f-maint") || null,
      background: val("#f-bg") || null,
      contributedBy: val("#f-by") || null,
      reviewedBy: val("#f-rev") || null,
      managementNotes: val("#f-notes") || null,
      name: nameEl.value.trim(),
      slug: slugEl.value.trim(),
      summary:
        editorEl.querySelector<HTMLInputElement>("#r-summary")!.value.trim() ||
        undefined,
      description: descEl.value.trim() || undefined,
      difficulty: editorEl.querySelector<HTMLSelectElement>("#r-diff")!.value,
      activity: editorEl.querySelector<HTMLSelectElement>("#r-act")!.value,
      region:
        editorEl.querySelector<HTMLInputElement>("#r-region")!.value.trim() ||
        undefined,
      province:
        editorEl.querySelector<HTMLInputElement>("#r-prov")!.value.trim() ||
        undefined,
      durationMin: durVal ? Number(durVal) : null,
    };
    if (coverPath !== undefined) body.coverPath = coverPath;
    try {
      if (r) await client.updateRoute(r.id, body);
      else await client.createRoute(body);
      onDone();
    } catch (err) {
      errEl.textContent = (err as Error).message;
    }
  };
}

// ─── POI create/edit form ─────────────────────────────────────
function openPoiForm(
  client: AdminApi,
  host: HTMLElement,
  routeId: string,
  poi: Partial<AdminPoi> & { lat: number; lng: number },
  onDone: () => Promise<void>,
): void {
  const editing = !!poi.id;
  host.innerHTML = `
    <div class="card" style="padding:14px; margin:12px 0">
      <strong>${editing ? "Editar POI" : "Nuevo POI"}</strong>
      <div class="row" style="margin-top:8px">
        <div class="field"><label>Tipo</label><select id="p-type">${POI_TYPE_LIST.map(
          (t) =>
            `<option value="${t}" ${
              poi.type === t ? "selected" : ""
            }>${POI_TYPES[t].label}</option>`,
        ).join("")}</select></div>
        <div class="field"><label>Nombre</label><input id="p-name" value="${esc(
          poi.name ?? "",
        )}" /></div>
      </div>
      <div class="field"><label>Descripción (Markdown)</label><textarea id="p-desc">${esc(
        poi.description ?? "",
      )}</textarea></div>
      <div class="row">
        <div class="field"><label>Lat</label><input id="p-lat" type="number" step="any" value="${
          poi.lat
        }" /></div>
        <div class="field"><label>Lng</label><input id="p-lng" type="number" step="any" value="${
          poi.lng
        }" /></div>
      </div>
      <div class="row">
        <div class="field"><label>Audioguía (mp3)</label><input type="file" id="p-audio" accept="audio/*" />
          <div class="hint" id="p-audio-status">${
            poi.audioPath ? "Audio cargado." : ""
          }</div></div>
        <div class="field"><label>Foto</label><input type="file" id="p-photo" accept="image/*" />
          <div class="hint" id="p-photo-status">${
            poi.photoPath ? "Foto cargada." : ""
          }</div></div>
      </div>
      <div class="field"><label>Transcripción del audio</label><textarea id="p-transcript">${esc(
        poi.audioTranscript ?? "",
      )}</textarea></div>
      <div class="field"><label>Video URL (YouTube/Vimeo)</label><input id="p-video" value="${esc(
        poi.videoUrl ?? "",
      )}" /></div>
      <label style="display:flex; gap:6px; align-items:center"><input type="checkbox" id="p-hidden" ${
        poi.hidden ? "checked" : ""
      } style="width:auto"/> Oculto</label>
      <div class="toolbar" style="margin-top:10px">
        <button class="primary" id="p-save">Guardar POI</button>
        <button id="p-cancel">Cancelar</button>
        <span class="hint" id="p-err"></span>
      </div>
    </div>`;

  const q = <T extends HTMLElement>(sel: string): T =>
    host.querySelector<T>(sel)!;
  let audioPath: string | null | undefined = poi.audioPath ?? undefined;
  let photoPath: string | null | undefined = poi.photoPath ?? undefined;

  q<HTMLInputElement>("#p-audio").onchange = async () => {
    const f = q<HTMLInputElement>("#p-audio").files?.[0];
    if (!f) return;
    q("#p-audio-status").textContent = "Subiendo…";
    const res = await client.upload("audio", f);
    audioPath = res.path;
    q("#p-audio-status").textContent = "Audio cargado ✓";
  };
  q<HTMLInputElement>("#p-photo").onchange = async () => {
    const f = q<HTMLInputElement>("#p-photo").files?.[0];
    if (!f) return;
    q("#p-photo-status").textContent = "Subiendo…";
    const res = await client.upload("photo", f);
    photoPath = res.path;
    q("#p-photo-status").textContent = "Foto cargada ✓";
  };

  q<HTMLButtonElement>("#p-cancel").onclick = () => {
    host.innerHTML = "";
  };
  q<HTMLButtonElement>("#p-save").onclick = async () => {
    const body: Record<string, unknown> = {
      type: q<HTMLSelectElement>("#p-type").value,
      name: q<HTMLInputElement>("#p-name").value.trim(),
      description: q<HTMLTextAreaElement>("#p-desc").value.trim() || null,
      lat: Number(q<HTMLInputElement>("#p-lat").value),
      lng: Number(q<HTMLInputElement>("#p-lng").value),
      audioTranscript:
        q<HTMLTextAreaElement>("#p-transcript").value.trim() || null,
      videoUrl: q<HTMLInputElement>("#p-video").value.trim() || null,
      hidden: q<HTMLInputElement>("#p-hidden").checked,
    };
    if (audioPath !== undefined) body.audioPath = audioPath;
    if (photoPath !== undefined) body.photoPath = photoPath;
    try {
      if (poi.id) await client.updatePoi(poi.id, body);
      else await client.createPoi({ ...body, routeId });
      host.innerHTML = "";
      await onDone();
    } catch (err) {
      q("#p-err").textContent = (err as Error).message;
    }
  };
}
