import L from "leaflet";
import { api, type Locale, type PoiDTO, type RouteDetail } from "../api.js";
import { createPoiPanel } from "../components/poiPanel.js";
import {
  createElevationChart,
  type ElevationChart,
  type TrackPoint,
} from "../components/elevationChart.js";
import { loadTrack } from "../track.js";
import { fmtDistance, fmtElevation, fmtDuration } from "../util.js";

const TILE_LAYERS = (): Record<string, L.TileLayer> => ({
  OpenTopoMap: L.tileLayer(
    "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    {
      maxZoom: 17,
      attribution:
        'Mapa: © <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA) · Datos: © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    },
  ),
  OpenStreetMap: L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
      maxZoom: 19,
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    },
  ),
  "Satélite (Esri)": L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    {
      maxZoom: 19,
      attribution:
        "Imágenes © Esri, Maxar, Earthstar Geographics y la comunidad GIS",
    },
  ),
});

export function renderViewer(
  app: HTMLElement,
  params: Record<string, string>,
): () => void {
  const slug = params.slug;
  app.innerHTML = `
    <div class="viewer">
      <div class="viewer-top">
        <a href="/" data-link title="Volver a los circuitos" class="v-back">←</a>
        <a href="/" data-link class="v-mark" title="YATEN"><img src="/mark.svg" alt="YATEN" height="26" /></a>
        <div class="title" id="v-title">Cargando…</div>
        <span class="chip" id="v-stats"></span>
        <div class="spacer"></div>
        <button id="v-poi-toggle" class="chip" type="button">☰ POIs</button>
        <label class="lang-switch" style="margin:0">
          <select id="v-lang" aria-label="Idioma">
            <option value="es">ES</option>
            <option value="en">EN</option>
            <option value="cy">CY</option>
          </select>
        </label>
        <a id="v-gpx" class="chip" style="display:none" download>⬇ GPX</a>
      </div>
      <div class="viewer-body">
        <div id="map"></div>
        <div id="poi-panel-host"></div>
      </div>
      <div class="viewer-elevation" id="elev-wrap" style="display:none">
        <div id="elevation"></div>
      </div>
    </div>
  `;

  const map = L.map("map", { attributionControl: true, zoomControl: true });
  const layers = TILE_LAYERS();
  layers.OpenTopoMap.addTo(map); // default: best for mountains
  L.control.layers(layers, {}, { position: "topright" }).addTo(map);
  map.setView([-42.91, -71.31], 11);

  const panelHost = app.querySelector<HTMLElement>("#poi-panel-host")!;
  const elevWrap = app.querySelector<HTMLElement>("#elev-wrap")!;
  const elevDiv = app.querySelector<HTMLElement>("#elevation")!;
  const titleEl = app.querySelector<HTMLElement>("#v-title")!;
  const statsEl = app.querySelector<HTMLElement>("#v-stats")!;
  const gpxLink = app.querySelector<HTMLAnchorElement>("#v-gpx")!;
  const langSel = app.querySelector<HTMLSelectElement>("#v-lang")!;
  const poiToggle = app.querySelector<HTMLButtonElement>("#v-poi-toggle")!;

  const markersById = new Map<string, L.Marker>();
  let activeMarker: L.Marker | null = null;
  let trackLine: L.Polyline | null = null;
  let hoverMarker: L.CircleMarker | null = null;
  let chart: ElevationChart | null = null;
  let trackPoints: TrackPoint[] = [];
  let route: RouteDetail | null = null;
  let onResize: (() => void) | null = null;

  const panel = createPoiPanel({
    onSelect: (poi) => {
      // POI chosen from the list → pan + highlight the matching marker.
      const marker = markersById.get(poi.id);
      if (marker) {
        setActiveMarker(marker);
        map.panTo([poi.lat, poi.lng]);
      }
    },
    onVisibilityChange: () =>
      // Let Leaflet recompute size after the panel opens/closes.
      setTimeout(() => map.invalidateSize(), 220),
  });
  panelHost.replaceWith(panel.root);

  poiToggle.addEventListener("click", () => panel.toggle());

  function setActiveMarker(marker: L.Marker | null): void {
    if (activeMarker) activeMarker.getElement()?.classList.remove("poi-active");
    activeMarker = marker;
    if (marker) {
      const elmt = marker.getElement();
      // Re-trigger the CSS bounce animation.
      elmt?.classList.remove("poi-active");
      void elmt?.offsetWidth;
      elmt?.classList.add("poi-active");
    }
  }

  function iconFor(poi: PoiDTO): L.Icon {
    return L.icon({
      iconUrl: poi.iconUrl,
      iconSize: [34, 46],
      iconAnchor: [17, 46],
      popupAnchor: [0, -42],
      className: "poi-marker",
    });
  }

  function clearMarkers(): void {
    for (const m of markersById.values()) map.removeLayer(m);
    markersById.clear();
    activeMarker = null;
  }

  function addMarkers(pois: PoiDTO[]): void {
    clearMarkers();
    for (const poi of pois) {
      const marker = L.marker([poi.lat, poi.lng], {
        icon: iconFor(poi),
        title: poi.name,
        riseOnHover: true,
      });
      marker.addTo(map);
      marker.on("click", () => selectPoi(poi, marker));
      markersById.set(poi.id, marker);
    }
  }

  function selectPoi(poi: PoiDTO, marker: L.Marker): void {
    setActiveMarker(marker);
    map.panTo([poi.lat, poi.lng]);
    panel.select(poi.id); // expand + scroll in the list (no onSelect loop)
  }

  // ─── Track + elevation ─────────────────────────────────────
  function drawTrack(points: TrackPoint[]): void {
    trackPoints = points;
    if (points.length < 2) return;

    const latlngs = points.map((p) => [p.lat, p.lng] as [number, number]);
    trackLine = L.polyline(latlngs, {
      color: "#e11d48",
      weight: 4,
      opacity: 0.9,
      lineJoin: "round",
    }).addTo(map);

    map.fitBounds(trackLine.getBounds(), { padding: [30, 30] });

    hoverMarker = L.circleMarker(latlngs[0], {
      radius: 7,
      color: "#fff",
      weight: 2,
      fillColor: "#e11d48",
      fillOpacity: 1,
      interactive: false,
    });

    elevWrap.style.display = "";
    chart = createElevationChart(elevDiv, points, (p) => {
      if (!hoverMarker) return;
      if (p) hoverMarker.setLatLng([p.lat, p.lng]).addTo(map);
      else map.removeLayer(hoverMarker);
    });

    // Hovering the track moves the chart cursor (bidirectional sync).
    trackLine.on("mousemove", (e: L.LeafletMouseEvent) => {
      const np = nearestByLatLng(e.latlng);
      if (np && chart) {
        chart.highlightAt(np.dist);
        hoverMarker?.setLatLng([np.lat, np.lng]).addTo(map);
      }
    });
    trackLine.on("mouseout", () => {
      chart?.highlightAt(null);
      if (hoverMarker) map.removeLayer(hoverMarker);
    });

    onResize = () => chart?.redraw();
    window.addEventListener("resize", onResize);
  }

  function nearestByLatLng(ll: L.LatLng): TrackPoint | null {
    let best: TrackPoint | null = null;
    let bestD = Infinity;
    for (const p of trackPoints) {
      const d = (p.lat - ll.lat) ** 2 + (p.lng - ll.lng) ** 2;
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

  function fitFallback(): void {
    if (
      route &&
      route.minLat != null &&
      route.minLng != null &&
      route.maxLat != null &&
      route.maxLng != null
    ) {
      map.fitBounds(
        [
          [route.minLat, route.minLng],
          [route.maxLat, route.maxLng],
        ],
        { padding: [30, 30] },
      );
    } else if (route?.centerLat != null && route?.centerLng != null) {
      map.setView([route.centerLat, route.centerLng], 12);
    }
  }

  // ─── Load ──────────────────────────────────────────────────
  async function loadPois(locale: Locale): Promise<void> {
    if (!route) return;
    const fresh = await api.getRoute(slug, locale);
    route = fresh;
    addMarkers(fresh.pois);
    panel.setFicha(fresh.ficha);
    panel.setPois(fresh.pois);
  }

  async function loadRoute(locale: Locale): Promise<void> {
    try {
      route = await api.getRoute(slug, locale);
    } catch (err) {
      titleEl.textContent = "Ruta no encontrada";
      const box = document.createElement("div");
      box.className = "error-box";
      box.style.margin = "12px";
      box.textContent = `No se pudo cargar la ruta: ${(err as Error).message}`;
      app.querySelector("#map")?.append(box);
      return;
    }

    titleEl.textContent = route.name;
    statsEl.innerHTML = `📏 ${fmtDistance(route.distanceM)} · ⛰️ ${fmtElevation(
      route.ascentM,
    )} · ⏱️ ${fmtDuration(route.durationMin)}`;
    langSel.value = locale;

    addMarkers(route.pois);
    panel.setFicha(route.ficha);
    panel.setPois(route.pois);
    fitFallback();

    if (route.gpxUrl) {
      gpxLink.href = route.gpxUrl;
      gpxLink.style.display = "";
      try {
        const points = await loadTrack(route.gpxUrl);
        drawTrack(points);
      } catch (err) {
        console.error("Track load failed:", err);
      }
    }
  }

  langSel.addEventListener("change", () => void loadPois(langSel.value as Locale));

  void loadRoute("es");

  return () => {
    if (onResize) window.removeEventListener("resize", onResize);
    chart?.destroy();
    map.remove();
  };
}
