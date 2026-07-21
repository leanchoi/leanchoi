import L from "leaflet";
import "@raruto/leaflet-elevation/dist/leaflet-elevation.min.css";
import "@raruto/leaflet-elevation";
import "leaflet.smooth_marker_bouncing";
import { api, type Locale, type PoiDTO, type RouteDetail } from "../api.js";
import { createPoiPanel } from "../components/poiPanel.js";
import { fmtDistance, fmtElevation, fmtDuration } from "../util.js";

// The elevation plugin has no types; we reach it through a narrow cast.
type ElevationControl = L.Control & {
  load: (url: string) => void;
  on: (ev: string, fn: (e: unknown) => void) => void;
};
type BouncingMarker = L.Marker & {
  bounce: (n?: number) => void;
  stopBouncing: () => void;
};

const TILE_LAYERS = (): Record<string, L.TileLayer> => ({
  OpenTopoMap: L.tileLayer(
    "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    {
      maxZoom: 17,
      attribution:
        'Mapa: © <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA) · Datos: © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    },
  ),
  "OpenStreetMap": L.tileLayer(
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
        <a href="/" data-link title="Volver al catálogo">←</a>
        <div class="title" id="v-title">Cargando…</div>
        <span class="chip" id="v-stats"></span>
        <div class="spacer"></div>
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
        <div class="viewer-elevation"><div id="elevation"></div></div>
        <div id="poi-panel-host"></div>
      </div>
    </div>
  `;

  const map = L.map("map", { attributionControl: true, zoomControl: true });
  const layers = TILE_LAYERS();
  layers.OpenTopoMap.addTo(map); // default: best for mountains
  L.control.layers(layers, {}, { position: "topright" }).addTo(map);
  map.setView([-42.91, -71.31], 11);

  // Elevation control (draws the track polyline AND the D3 profile).
  const elev = (
    L.control as unknown as {
      elevation: (opts: Record<string, unknown>) => ElevationControl;
    }
  ).elevation({
    theme: "steelblue-theme",
    detached: true,
    elevationDiv: "#elevation",
    followMarker: true,
    imperial: false,
    summary: "inline",
    ruler: true,
    autohide: false,
    legend: true,
  });
  elev.addTo(map);

  const panelHost = app.querySelector<HTMLElement>("#poi-panel-host")!;
  const markers: BouncingMarker[] = [];
  let activeMarker: BouncingMarker | null = null;

  const panel = createPoiPanel(() => {
    if (activeMarker) {
      activeMarker.stopBouncing();
      activeMarker = null;
    }
  });
  panelHost.replaceWith(panel.root);

  const titleEl = app.querySelector<HTMLElement>("#v-title")!;
  const statsEl = app.querySelector<HTMLElement>("#v-stats")!;
  const gpxLink = app.querySelector<HTMLAnchorElement>("#v-gpx")!;
  const langSel = app.querySelector<HTMLSelectElement>("#v-lang")!;

  let route: RouteDetail | null = null;
  let gpxLoaded = false;

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
    for (const m of markers) map.removeLayer(m);
    markers.length = 0;
    activeMarker = null;
  }

  function addMarkers(pois: PoiDTO[]): void {
    clearMarkers();
    for (const poi of pois) {
      const marker = L.marker([poi.lat, poi.lng], {
        icon: iconFor(poi),
        title: poi.name,
      }) as BouncingMarker;
      marker.addTo(map);
      marker.on("click", () => selectPoi(poi, marker));
      markers.push(marker);
    }
  }

  function selectPoi(poi: PoiDTO, marker: BouncingMarker): void {
    if (activeMarker && activeMarker !== marker) activeMarker.stopBouncing();
    activeMarker = marker;
    marker.bounce();
    panel.show(poi);
  }

  function fitToRoute(): void {
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
    }
  }

  elev.on("eledata_loaded", () => {
    gpxLoaded = true;
    fitToRoute();
  });

  async function loadRoute(locale: Locale): Promise<void> {
    try {
      route = await api.getRoute(slug, locale);
    } catch (err) {
      titleEl.textContent = "Ruta no encontrada";
      statsEl.textContent = "";
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

    if (route.gpxUrl) {
      gpxLink.href = route.gpxUrl;
      gpxLink.style.display = "";
      if (!gpxLoaded) elev.load(route.gpxUrl);
    }

    addMarkers(route.pois);
    if (gpxLoaded) fitToRoute();
    else if (route.centerLat != null && route.centerLng != null) {
      map.setView([route.centerLat, route.centerLng], 12);
    }
  }

  langSel.addEventListener("change", () => {
    // Re-fetch localized POIs without reloading the map/track.
    void loadRoute(langSel.value as Locale);
  });

  void loadRoute("es");

  // Cleanup on route change.
  return () => {
    panel.hide();
    map.remove();
  };
}
