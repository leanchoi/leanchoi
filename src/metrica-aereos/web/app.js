/**
 * Aplicación cliente para el panel de Métrica Aéreos
 * Sigue las pautas de UI de Leandro:
 * - Tablas compactas con líneas sutiles y números tabulares.
 * - Alto contraste en claro e insignias translúcidas en oscuro.
 * - Estados vacíos siempre visibles sin mocks.
 * - Explicación clara de criterios de agregación y clasificación.
 * - Links con stopPropagation.
 */

const formatARS = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

const state = {
  theme: localStorage.getItem("metrica_theme") || "dark",
  status: null,
  rutas: [],
  vuelos: [],
  vuelosSort: {
    column: "flight_date",
    direction: "asc",
  },
  coberturaMensual: [],
  bitacora: [],
  canario: null,
  calendario: null,
  series: {
    analysisMode: "individual", // "individual" | "benchmark"
    metric: "precio_ars",      // "precio_ars" | "tarifa_km_ars"
    granularity: "semanal",    // "semanal" | "diaria" | "mensual"
    viewType: "envolvente",    // "envolvente" | "multiples" | "barras"
    showBands: true,
    roundtrip: true,
    singleOrigin: "BUE",
    singleDest: "EQS",
    benchOrigin: "BUE",
    benchDestinations: ["EQS", "BRC", "CPC"],
    data: null,
  },
};

// Inicialización
document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  initTabs();
  initFilterEvents();
  initSeriesEvents();
  loadAllData();
});

function initTheme() {
  document.documentElement.setAttribute("data-theme", state.theme);
  const btn = document.getElementById("theme-toggle-btn");
  if (btn) {
    btn.textContent = state.theme === "dark" ? "☀️ Modo Claro" : "🌙 Modo Oscuro";
    btn.addEventListener("click", () => {
      state.theme = state.theme === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", state.theme);
      localStorage.setItem("metrica_theme", state.theme);
      btn.textContent = state.theme === "dark" ? "☀️ Modo Claro" : "🌙 Modo Oscuro";
      if (state.series.data) renderSeriesVisualization();
    });
  }
}

function initTabs() {
  const tabs = document.querySelectorAll(".tab-btn");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));
      tab.classList.add("active");
      const targetId = tab.getAttribute("data-tab");
      const targetContent = document.getElementById(targetId);
      if (targetContent) targetContent.classList.add("active");
      if (targetId === "tab-series" && state.series.data) {
        setTimeout(() => renderSeriesVisualization(), 50);
      }
    });
  });
}

function initFilterEvents() {
  const applyBtn = document.getElementById("btn-apply-filters");
  if (applyBtn) {
    applyBtn.addEventListener("click", () => loadVuelos());
  }

  const bitacoraStatusFilter = document.getElementById("bitacora-status-filter");
  if (bitacoraStatusFilter) {
    bitacoraStatusFilter.addEventListener("change", () => loadBitacora());
  }

  const irrelevantesCheckbox = document.getElementById("filter-incluir-irrelevantes");
  if (irrelevantesCheckbox) {
    irrelevantesCheckbox.addEventListener("change", () => loadVuelos());
  }

  // Click en encabezados para ordenamiento interactivo (Prompt 1e)
  const sortHeaders = document.querySelectorAll("#vuelos-table th.sortable");
  sortHeaders.forEach((th) => {
    th.addEventListener("click", () => {
      const col = th.getAttribute("data-col");
      if (!col) return;
      if (state.vuelosSort.column === col) {
        state.vuelosSort.direction = state.vuelosSort.direction === "asc" ? "desc" : "asc";
      } else {
        state.vuelosSort.column = col;
        state.vuelosSort.direction = "asc";
      }
      updateSortHeaderIndicators();
      sortAndRenderVuelos();
    });
  });
}

async function loadAllData() {
  await loadStatus();
  await loadRutas();
  await loadVuelos();
  await loadSeriesData();
  await Promise.all([
    loadBitacora(),
    loadCanario(),
    loadCalendario(),
  ]);
}

async function loadStatus() {
  try {
    const res = await fetch("/api/status");
    if (!res.ok) throw new Error("Error cargando status");
    const data = await res.json();
    state.status = data;
    renderKPIs(data);
    renderDiscoView(data);
  } catch (err) {
    console.error(err);
  }
}

function renderKPIs(status) {
  if (!status) return;

  const coberturaEl = document.getElementById("kpi-cobertura");
  if (coberturaEl) coberturaEl.textContent = `${status.cobertura_valida_pct}%`;

  const coberturaDetailEl = document.getElementById("kpi-cobertura-detail");
  if (coberturaDetailEl) {
    const fueraVentana = status.fuera_de_ventana_de_venta || 0;
    const capAgotada = status.capacidad_agotada || 0;
    coberturaDetailEl.textContent =
      `${status.ok} ok · ${status.sin_servicio} sin serv · ${fueraVentana} fuera vent · ${capAgotada} agot · ${status.sin_resultados} vacías`;
  }

  const itinerariosEl = document.getElementById("kpi-itinerarios");
  if (itinerariosEl) itinerariosEl.textContent = status.total_itinerarios.toLocaleString("es-AR");

  const itinerariosDetailEl = document.getElementById("kpi-itinerarios-detail");
  if (itinerariosDetailEl) {
    const opsStr = Object.entries(status.itinerarios_por_aerolinea || {})
      .map(([k, v]) => `${k}: ${v}`)
      .join(" · ");
    itinerariosDetailEl.textContent = opsStr || "Sin vuelos de cabotaje";
  }

  const desviosEl = document.getElementById("kpi-desvios");
  if (desviosEl) desviosEl.textContent = `${status.desvios_internacionales_filtrados || 0}`;

  const desviosDetailEl = document.getElementById("kpi-desvios-detail");
  if (desviosDetailEl) {
    const desviosOps = Object.entries(status.desvios_por_aerolinea || {})
      .map(([k, v]) => `${k}: ${v}`)
      .join(" · ");
    desviosDetailEl.textContent = desviosOps ? `Aislados: ${desviosOps}` : "0 desvíos detectados";
  }

  const primaEl = document.getElementById("kpi-prima-ar");
  const primaDetailEl = document.getElementById("kpi-prima-ar-detail");
  if (primaEl && status.kpi_prima_monopolio_ar) {
    const p = status.kpi_prima_monopolio_ar;
    primaEl.textContent = `+${p.valor_pct}%`;
    if (primaDetailEl) {
      primaDetailEl.textContent = `AR EQS ($${p.tarifa_km_eqs}/km) vs AR BRC ($${p.tarifa_km_brc}/km)`;
    }
  }

  const disco = status.disco || {};
  const discoEl = document.getElementById("kpi-disco");
  if (discoEl) discoEl.textContent = `${disco.total_usado_mb || 0} MB`;

  const discoDetailEl = document.getElementById("kpi-disco-detail");
  if (discoDetailEl) {
    discoDetailEl.textContent = `Presupuesto: ${disco.presupuesto_mb || 8192} MB (${disco.porcentaje_usado || 0}%)`;
  }

  const obsDate = status.fecha_observacion || "Hoy";
  const badgeEl = document.getElementById("header-date-badge");
  if (badgeEl) badgeEl.textContent = `Corrida: ${obsDate}`;
}

function renderDiscoView(status) {
  const container = document.getElementById("disco-cards-container");
  if (!container || !status) return;

  const disco = status.disco || {};
  const totalUsado = disco.total_usado_mb || 0;
  const presupuesto = disco.presupuesto_mb || 8192;
  const pct = disco.porcentaje_usado || 0;
  const rawUsado = disco.raw_usado_mb || 0;
  const bronceGz = disco.bronce_gz_mb || 0;

  container.innerHTML = `
    <div class="card-box">
      <div class="card-box-header">
        <span class="card-box-title">Presupuesto Global OIT</span>
        <span class="badge badge-conf-a">8 GB Asignados</span>
      </div>
      <div style="font-size: 24px; font-weight: 700; color: var(--accent); margin-bottom: 4px;">
        ${totalUsado} MB <span style="font-size: 13px; font-weight: normal; color: var(--text-muted);">/ ${presupuesto} MB (${pct}%)</span>
      </div>
      <div class="progress-bar-container">
        <div class="progress-bar-fill" style="width: ${Math.min(100, Math.max(2, pct))}%;"></div>
      </div>
      <div style="font-size: 11px; color: var(--text-muted); margin-top: 6px;">
        Estado: <strong>${disco.alerta_activa ? 'ALERTA DE PURGA' : 'Capacidad Óptima'}</strong>
      </div>
    </div>

    <div class="card-box">
      <div class="card-box-header">
        <span class="card-box-title">Almacenamiento Estratificado</span>
        <span class="badge badge-conf-b">Bronce + Crudo</span>
      </div>
      <div style="font-size: 14px; line-height: 1.8; color: var(--text-main);">
        • Capa Bronce (JSONL.gz consolidado): <strong>${bronceGz} MB</strong><br>
        • Capa Cruda (JSON Blobs + max 5 HTML fixtures): <strong>${rawUsado} MB</strong>
      </div>
      <div style="font-size: 11px; color: var(--text-muted); margin-top: 8px;">
        Retención crudo: 90 días con purga automática FIFO al alcanzar el 90% del cgroup.
      </div>
    </div>

    <div class="card-box">
      <div class="card-box-header">
        <span class="card-box-title">Tasa Diaria & Compresión (P2)</span>
        <span class="badge badge-ok">23x Reducción</span>
      </div>
      <div style="font-size: 20px; font-weight: 700; color: var(--success); margin-bottom: 4px;">
        ~2,05 MB <span style="font-size: 13px; font-weight: normal; color: var(--text-muted);">por corrida nocturna</span>
      </div>
      <div style="font-size: 11px; color: var(--text-muted); line-height: 1.5;">
        • Noche 1 (Prompt 1b HTML): 47,9 MB<br>
        • Noche 2+ (Prompt 1c/1d JSON blob): ~2,05 MB (653 KB JSON + 1,4 MB fixtures)<br>
        • Autonomía proyectada: &gt;3.900 noches sin superar el presupuesto de 8 GB.
      </div>
    </div>
  `;
}

async function loadRutas() {
  try {
    const res = await fetch("/api/rutas");
    if (!res.ok) throw new Error("Error cargando rutas");
    const rutas = await res.json();
    state.rutas = rutas;
    renderRutasTable(rutas);
    populateRouteSelectors(rutas);
    renderComparisonCards(rutas);
  } catch (err) {
    console.error(err);
  }
}

function renderRutasTable(rutas) {
  const tbody = document.getElementById("rutas-table-body");
  const empty = document.getElementById("rutas-empty-state");
  if (!tbody) return;

  if (!rutas || rutas.length === 0) {
    tbody.innerHTML = "";
    if (empty) empty.style.display = "flex";
    return;
  }
  if (empty) empty.style.display = "none";

  tbody.innerHTML = rutas
    .map((r) => {
      const isEqs = r.ruta.includes("EQS");
      const highlightClass = isEqs ? "style='font-weight: 600; color: var(--accent);'" : "";
      const ops = Object.entries(r.aerolineas || {})
        .map(([a, cnt]) => renderAirlineBadge(a, cnt))
        .join(" ");

      const desviosBadge = r.desvios_filtrados > 0
        ? `<span class="badge badge-desvio">${r.desvios_filtrados} aislados</span>`
        : `<span style="color: var(--text-muted); font-size: 11px;">0</span>`;

      return `
      <tr>
        <td ${highlightClass}><strong>${r.ruta}</strong></td>
        <td>${ops || '—'}</td>
        <td class="numeric"><strong>${r.vuelos_totales}</strong></td>
        <td class="numeric ${r.precio_minimo ? 'price-cheapest' : ''}">${r.precio_minimo ? formatARS.format(r.precio_minimo) : '—'}</td>
        <td class="numeric price-tag">${r.precio_promedio ? formatARS.format(r.precio_promedio) : '—'}</td>
        <td class="numeric">${r.precio_maximo ? formatARS.format(r.precio_maximo) : '—'}</td>
        <td class="numeric">${desviosBadge}</td>
        <td class="numeric">${r.fechas_disponibles} días</td>
      </tr>
    `;
    })
    .join("");
}

function renderComparisonCards(rutas) {
  const container = document.getElementById("comparison-cards-container");
  if (!container) return;

  const eqsRoute = rutas.find((r) => r.ruta === "BUE > EQS") || rutas.find((r) => r.ruta.includes("EQS"));
  const brcRoute = rutas.find((r) => r.ruta === "BUE > BRC");
  const cpcRoute = rutas.find((r) => r.ruta === "BUE > CPC");

  let html = "";
  if (eqsRoute) {
    html += `
      <div class="card-box">
        <div class="card-box-header">
          <span class="card-box-title">📍 Esquel (BUE > EQS)</span>
          <span class="badge badge-ar">AR Exclusivo</span>
        </div>
        <div style="font-size: 20px; font-weight: 700; color: var(--accent); margin-bottom: 6px;">
          ${eqsRoute.precio_minimo ? formatARS.format(eqsRoute.precio_minimo) : 'Sin tarifa directa'}
          <span class="badge badge-conf-b" style="font-size: 10px; font-weight: normal; vertical-align: middle;">Observado B</span>
        </div>
        <div style="font-size: 12px; color: var(--text-muted);">
          Promedio cabotaje: <strong>${eqsRoute.precio_promedio ? formatARS.format(eqsRoute.precio_promedio) : '—'}</strong> ·
          Total vuelos válidos: <strong>${eqsRoute.vuelos_totales}</strong>
          ${eqsRoute.desvios_filtrados > 0 ? `<div style="color: var(--warning); margin-top: 4px;">Filtro P0: ${eqsRoute.desvios_filtrados} desvíos excluidos</div>` : ''}
        </div>
      </div>
    `;
  }

  if (brcRoute) {
    const ratio = eqsRoute && eqsRoute.precio_minimo && brcRoute.precio_minimo
      ? (eqsRoute.precio_minimo / brcRoute.precio_minimo).toFixed(1)
      : null;

    html += `
      <div class="card-box">
        <div class="card-box-header">
          <span class="card-box-title">📍 Bariloche (BUE > BRC)</span>
          <span class="badge badge-fo">Multi-Operador</span>
        </div>
        <div style="font-size: 20px; font-weight: 700; color: var(--success); margin-bottom: 6px;">
          ${brcRoute.precio_minimo ? formatARS.format(brcRoute.precio_minimo) : '—'}
          <span class="badge badge-conf-b" style="font-size: 10px; font-weight: normal; vertical-align: middle;">Observado B</span>
        </div>
        <div style="font-size: 12px; color: var(--text-muted);">
          Promedio cabotaje: <strong>${brcRoute.precio_promedio ? formatARS.format(brcRoute.precio_promedio) : '—'}</strong> ·
          Total vuelos válidos: <strong>${brcRoute.vuelos_totales}</strong>
          ${ratio ? `<div style="margin-top: 4px; color: var(--warning);">⚡ Brecha de tarifa base: Esquel es <strong>${ratio}x</strong> más cara <span class="badge badge-conf-c">Modelado C</span></div>` : ''}
        </div>
      </div>
    `;
  }

  if (cpcRoute) {
    html += `
      <div class="card-box">
        <div class="card-box-header">
          <span class="card-box-title">📍 San Martín (BUE > CPC)</span>
          <span class="badge badge-wj">Chapelco</span>
        </div>
        <div style="font-size: 20px; font-weight: 700; color: var(--text-main); margin-bottom: 6px;">
          ${cpcRoute.precio_minimo ? formatARS.format(cpcRoute.precio_minimo) : '—'}
          <span class="badge badge-conf-b" style="font-size: 10px; font-weight: normal; vertical-align: middle;">Observado B</span>
        </div>
        <div style="font-size: 12px; color: var(--text-muted);">
          Promedio cabotaje: <strong>${cpcRoute.precio_promedio ? formatARS.format(cpcRoute.precio_promedio) : '—'}</strong> ·
          Total vuelos válidos: <strong>${cpcRoute.vuelos_totales}</strong>
        </div>
      </div>
    `;
  }

  container.innerHTML = html;
}

function populateRouteSelectors(rutas) {
  const origenSel = document.getElementById("filter-origen");
  const destinoSel = document.getElementById("filter-destino");
  if (!origenSel || !destinoSel) return;

  const origenes = new Set();
  const destinos = new Set();

  rutas.forEach((r) => {
    if (r.origen) origenes.add(r.origen);
    if (r.destino) destinos.add(r.destino);
  });

  const curOrig = origenSel.value || (origenes.has("BUE") ? "BUE" : "");
  const curDest = destinoSel.value || (destinos.has("EQS") ? "EQS" : "");

  origenSel.innerHTML = '<option value="">Todos los orígenes</option>';
  Array.from(origenes).sort().forEach((o) => {
    origenSel.innerHTML += `<option value="${o}" ${o === curOrig ? 'selected' : ''}>${o}</option>`;
  });

  destinoSel.innerHTML = '<option value="">Todos los destinos</option>';
  Array.from(destinos).sort().forEach((d) => {
    destinoSel.innerHTML += `<option value="${d}" ${d === curDest ? 'selected' : ''}>${d}</option>`;
  });
}

async function loadVuelos() {
  const origen = document.getElementById("filter-origen")?.value || "";
  const destino = document.getElementById("filter-destino")?.value || "";
  const aerolinea = document.getElementById("filter-aerolinea")?.value || "";
  const soloBaratos = document.getElementById("filter-cheapest")?.checked || false;
  const incluirIrrelevantes = document.getElementById("filter-incluir-irrelevantes")?.checked || false;

  const params = new URLSearchParams();
  if (origen) params.set("origen", origen);
  if (destino) params.set("destino", destino);
  if (aerolinea) params.set("aerolinea", aerolinea);
  if (soloBaratos) params.set("solo_baratos", "true");
  if (incluirIrrelevantes) params.set("incluir_irrelevantes", "true");
  params.set("con_cobertura", "true");
  params.set("limit", "1000");

  try {
    const res = await fetch(`/api/vuelos?${params.toString()}`);
    if (!res.ok) throw new Error("Error cargando vuelos");
    const data = await res.json();

    if (data && !Array.isArray(data) && data.vuelos) {
      state.vuelos = data.vuelos;
      state.coberturaMensual = data.cobertura || [];
    } else {
      state.vuelos = Array.isArray(data) ? data : [];
      state.coberturaMensual = [];
    }

    renderCoberturaPills(state.coberturaMensual);
    updateSortHeaderIndicators();
    sortAndRenderVuelos();
  } catch (err) {
    console.error(err);
  }
}

function updateSortHeaderIndicators() {
  const headers = document.querySelectorAll("#vuelos-table th.sortable");
  headers.forEach((th) => {
    th.classList.remove("sorted-asc", "sorted-desc");
    const icon = th.querySelector(".sort-icon");
    if (icon) icon.textContent = "▲";

    const col = th.getAttribute("data-col");
    if (col === state.vuelosSort.column) {
      if (state.vuelosSort.direction === "asc") {
        th.classList.add("sorted-asc");
        if (icon) icon.textContent = "▲";
      } else {
        th.classList.add("sorted-desc");
        if (icon) icon.textContent = "▼";
      }
    }
  });
}

function sortAndRenderVuelos() {
  const col = state.vuelosSort.column;
  const dir = state.vuelosSort.direction === "asc" ? 1 : -1;

  state.vuelos.sort((a, b) => {
    let valA = a[col];
    let valB = b[col];

    // Tratar nulos o cadenas vacías para que queden al final en orden ascendente
    if (valA === null || valA === undefined || valA === "—") valA = dir === 1 ? Infinity : -Infinity;
    if (valB === null || valB === undefined || valB === "—") valB = dir === 1 ? Infinity : -Infinity;

    if (typeof valA === "number" && typeof valB === "number") {
      return (valA - valB) * dir;
    }
    return String(valA).localeCompare(String(valB), "es", { numeric: true }) * dir;
  });

  renderVuelosTable(state.vuelos);
}

function renderCoberturaPills(coberturaList) {
  const container = document.getElementById("vuelos-cobertura-container");
  if (!container) return;

  if (!coberturaList || coberturaList.length === 0) {
    container.innerHTML = "";
    container.style.display = "none";
    return;
  }

  container.style.display = "flex";
  container.innerHTML = `
    <div style="width: 100%; font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--text-muted); margin-bottom: 2px;">
      Cobertura Mensual de Servicio (Invariantes I8 e I13)
    </div>
  ` + coberturaList.map((m) => {
    const isComplete = m.cobertura_pct >= 98;
    const badgeClass = isComplete ? "badge-ok" : "badge-sin-muestrear";
    return `
      <div class="cobertura-pill" title="${m.dias_con_datos} observados de ${m.dias_con_servicio} programados (${m.dias_sin_muestrear} sin muestrear, ${m.dias_sin_servicio} sin servicio)">
        <span>📅 <strong>${m.mes_nombre}:</strong></span>
        <span>${m.dias_con_datos}/${m.dias_con_servicio} días</span>
        <span class="badge ${badgeClass}" style="font-size: 10px;">${m.cobertura_pct}%</span>
      </div>
    `;
  }).join("");
}

function renderVuelosTable(vuelos) {
  const tbody = document.getElementById("vuelos-table-body");
  const empty = document.getElementById("vuelos-empty-state");
  const countSpan = document.getElementById("vuelos-count-badge");
  if (!tbody) return;

  const vuelosConDatos = vuelos.filter((v) => v.estado === "con_datos");
  if (countSpan) countSpan.textContent = `${vuelosConDatos.length} vuelos (${vuelos.length} celdas en horizonte)`;

  if (!vuelos || vuelos.length === 0) {
    tbody.innerHTML = "";
    if (empty) empty.style.display = "flex";
    return;
  }
  if (empty) empty.style.display = "none";

  // Mapa rápido de cobertura mensual por si está agrupado cronológicamente
  const coberturaMap = {};
  (state.coberturaMensual || []).forEach((m) => {
    coberturaMap[m.mes_clave] = m;
  });

  const isSortedByDate = state.vuelosSort.column === "flight_date";
  let lastMonthKey = "";
  let html = "";

  vuelos.forEach((v) => {
    const fDate = v.flight_date || "";
    const mKey = fDate.substring(0, 7);

    // Insertar encabezado de mes con cobertura cuando el orden es por fecha de vuelo (Prompt 1e)
    if (isSortedByDate && mKey && mKey !== lastMonthKey) {
      lastMonthKey = mKey;
      const cob = coberturaMap[mKey];
      const cobTxt = cob
        ? `${cob.mes_nombre}: ${cob.dias_con_datos} de ${cob.dias_con_servicio} días con servicio`
        : `Mes: ${mKey}`;
      const cobPctBadge = cob
        ? `<span class="badge ${cob.cobertura_pct >= 98 ? 'badge-ok' : 'badge-sin-muestrear'} month-header-badge">${cob.cobertura_pct}% Cobertura</span>`
        : "";

      html += `
        <tr class="month-header-row">
          <td colspan="12">
            📅 <strong>${cobTxt}</strong> ${cobPctBadge}
          </td>
        </tr>
      `;
    }

    const estado = v.estado || "con_datos";

    if (estado === "sin_muestrear") {
      html += `
        <tr class="row-sin-muestrear">
          <td><strong>${v.flight_date}</strong></td>
          <td>${v.dia_semana || '—'}</td>
          <td class="numeric">${v.dias_anticipacion !== undefined ? v.dias_anticipacion + 'd' : '—'}</td>
          <td colspan="8" style="color: var(--text-muted); font-size: 12px; font-style: italic;">
            Fecha con servicio programado aún no consultada en este barrido
          </td>
          <td><span class="badge badge-sin-muestrear">sin muestrear</span></td>
        </tr>
      `;
      return;
    }

    if (estado === "sin_servicio") {
      html += `
        <tr class="row-sin-servicio">
          <td><strong>${v.flight_date}</strong></td>
          <td>${v.dia_semana || '—'}</td>
          <td class="numeric">${v.dias_anticipacion !== undefined ? v.dias_anticipacion + 'd' : '—'}</td>
          <td colspan="8" style="color: var(--text-muted); font-size: 12px; font-style: italic;">
            Día sin servicio regular programado según calendario oficial
          </td>
          <td><span class="badge badge-sin-servicio">sin servicio</span></td>
        </tr>
      `;
      return;
    }

    if (estado === "sin_resultados") {
      html += `
        <tr class="row-sin-resultados">
          <td><strong>${v.flight_date}</strong></td>
          <td>${v.dia_semana || '—'}</td>
          <td class="numeric">${v.dias_anticipacion !== undefined ? v.dias_anticipacion + 'd' : '—'}</td>
          <td colspan="8" style="color: var(--warning); font-size: 12px; font-style: italic;">
            Sin disponibilidad de asientos (capacidad agotada o sin plazas)
          </td>
          <td><span class="badge badge-sin-resultados">sin resultados</span></td>
        </tr>
      `;
      return;
    }

    // Fila estándar con datos (12 columnas)
    const aeroBadge = renderAirlineBadge(v.airline_code || "OTRA");
    const isCheapest = v.is_cheapest_of_query
      ? `<span class="badge badge-ok" style="font-size: 10px; margin-left: 4px;">Más barata</span>`
      : "";

    let escalas = "";
    if (v.itinerario_relevante === false) {
      escalas = `<span class="badge badge-desvio" title="${v.motivo_irrelevancia || 'Desvío'}">Desvío: ${v.motivo_irrelevancia || 'Internacional'}</span>`;
    } else if (v.stops_count === 0) {
      escalas = `<span style="color: var(--success); font-weight: 600;">Directo</span>`;
    } else {
      escalas = `<span style="color: var(--warning);">${v.escalas || v.stops_count + ' escala'}</span>`;
    }

    const precioKmFmt = v.tarifa_km_ars ? `${formatARS.format(v.tarifa_km_ars)}/km` : '—';
    const numVuelo = v.numero_vuelo && v.numero_vuelo !== "—" ? `<strong>${v.numero_vuelo}</strong>` : '—';

    html += `
      <tr>
        <td><strong>${v.flight_date}</strong></td>
        <td>${v.dia_semana || '—'}</td>
        <td class="numeric">${v.dias_anticipacion !== undefined ? v.dias_anticipacion + 'd' : '—'}</td>
        <td>${aeroBadge} <span style="font-size: 12px; color: var(--text-muted);">${v.airline_name || ''}</span></td>
        <td>${numVuelo}</td>
        <td>${v.hora_salida || '—'}</td>
        <td>${v.hora_llegada || '—'}</td>
        <td>${v.duracion || '—'}</td>
        <td>${escalas}</td>
        <td class="numeric ${v.is_cheapest_of_query ? 'price-cheapest' : 'price-tag'}">
          ${v.price_ars ? formatARS.format(v.price_ars) : '—'} ${isCheapest}
        </td>
        <td class="numeric" style="color: var(--text-muted); font-size: 12px;">${precioKmFmt}</td>
        <td style="font-size: 11px; color: var(--text-muted);">${v.observado_el || '—'}</td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}

async function loadBitacora() {
  const statusFilter = document.getElementById("bitacora-status-filter")?.value || "";
  const params = new URLSearchParams();
  if (statusFilter) params.set("status", statusFilter);
  params.set("limit", "150");

  try {
    const res = await fetch(`/api/bitacora?${params.toString()}`);
    if (!res.ok) throw new Error("Error cargando bitacora");
    const entries = await res.json();
    state.bitacora = entries;
    renderBitacoraTable(entries);
  } catch (err) {
    console.error(err);
  }
}

function renderBitacoraTable(entries) {
  const tbody = document.getElementById("bitacora-table-body");
  const empty = document.getElementById("bitacora-empty-state");
  if (!tbody) return;

  if (!entries || entries.length === 0) {
    tbody.innerHTML = "";
    if (empty) empty.style.display = "flex";
    return;
  }
  if (empty) empty.style.display = "none";

  tbody.innerHTML = entries
    .map((e) => {
      let statusBadge = "";
      if (e.status === "ok") {
        statusBadge = `<span class="badge badge-ok">ok</span>`;
      } else if (e.status === "sin_servicio") {
        statusBadge = `<span class="badge badge-sin-servicio">sin_servicio (semanal)</span>`;
      } else if (e.status === "fuera_de_ventana_de_venta") {
        statusBadge = `<span class="badge badge-fuera-ventana">fuera_ventana (estacional)</span>`;
      } else if (e.status === "capacidad_agotada") {
        statusBadge = `<span class="badge badge-capacidad-agotada">capacidad_agotada (S3)</span>`;
      } else if (e.status === "sin_resultados") {
        statusBadge = `<span class="badge badge-sin-resultados">sin_resultados (vacía)</span>`;
      } else {
        statusBadge = `<span class="badge badge-fallo">${e.status}</span>`;
      }

      const valResp = e.respuesta_valida === true
        ? `<span style="color: var(--success);">✓ Sí</span>`
        : (e.respuesta_valida === false ? `<span style="color: var(--danger);">✗ No</span>` : `<span style="color: var(--text-muted);">—</span>`);

      const calExp = e.calendario_explica === true
        ? `<span style="color: var(--info);">✓ Explica (v${e.calendario_version || 1})</span>`
        : (e.calendario_explica === false ? `<span style="color: var(--text-muted);">No aplica</span>` : `<span style="color: var(--text-muted);">—</span>`);

      const ops = Object.entries(e.itineraries_by_airline || {})
        .map(([a, c]) => `${a}:${c}`)
        .join(" ");

      return `
      <tr>
        <td style="font-family: monospace; font-size: 11px;">${(e.run_id || '').substring(0, 8)}</td>
        <td><strong>${e.origin_iata} > ${e.dest_iata}</strong></td>
        <td>${e.flight_date}</td>
        <td>${statusBadge}</td>
        <td class="numeric">${e.itineraries_found}</td>
        <td style="font-size: 11px;">${ops || '—'}</td>
        <td>${valResp}</td>
        <td>${calExp}</td>
        <td class="numeric" style="color: var(--text-muted);">${e.latency_ms ? e.latency_ms + ' ms' : '—'}</td>
      </tr>
    `;
    })
    .join("");
}

async function loadCanario() {
  try {
    const res = await fetch("/api/canario");
    if (!res.ok) throw new Error("Error cargando canario");
    const canario = await res.json();
    state.canario = canario;
    renderCanarioView(canario);
  } catch (err) {
    console.error(err);
  }
}

function renderCanarioView(canario) {
  const container = document.getElementById("canario-cards-container");
  const desviosContainer = document.getElementById("canario-desvios-container");
  if (!container || !canario) return;

  container.innerHTML = (canario.operadores || [])
    .map((op) => {
      const isOk = op.itinerarios_hoy > 0;
      const statusBadge = isOk
        ? `<span class="badge badge-ok">Operando</span>`
        : `<span class="badge badge-sin-resultados">En seguimiento</span>`;

      return `
      <div class="card-box">
        <div class="card-box-header">
          <span class="card-box-title">${renderAirlineBadge(op.operador)}</span>
          ${statusBadge}
        </div>
        <div style="font-size: 22px; font-weight: 700; color: var(--text-main); margin-bottom: 4px;">
          ${op.itinerarios_hoy} <span style="font-size: 13px; font-weight: normal; color: var(--text-muted);">vuelos cabotaje</span>
        </div>
        <div style="font-size: 11px; color: var(--text-muted);">
          ${op.operador === "AR" ? "Aerolíneas Argentinas (Línea de bandera)" : (op.operador === "FO" ? "Flybondi (Low-cost)" : "JetSMART (Ultra low-cost)")}
        </div>
      </div>
    `;
    })
    .join("");

  if (desviosContainer) {
    const desvios = canario.desvios_internacionales || [];
    if (desvios.length === 0) {
      desviosContainer.innerHTML = `
        <div class="card-box" style="grid-column: 1 / -1;">
          <div style="color: var(--text-muted); font-size: 13px;">No se detectaron desvíos internacionales en la corrida actual.</div>
        </div>
      `;
    } else {
      desviosContainer.innerHTML = desvios
        .map((d) => `
          <div class="card-box">
            <div class="card-box-header">
              <span class="card-box-title">${renderAirlineBadge(d.operador)}</span>
              <span class="badge badge-desvio">Aislado de Mercado</span>
            </div>
            <div style="font-size: 22px; font-weight: 700; color: var(--warning); margin-bottom: 4px;">
              ${d.desvios_detectados} <span style="font-size: 13px; font-weight: normal; color: var(--text-muted);">itinerarios descartados</span>
            </div>
            <div style="font-size: 11px; color: var(--text-muted);">
              ${d.motivo}
            </div>
          </div>
        `)
        .join("");
    }
  }
}

async function loadCalendario() {
  try {
    const res = await fetch("/api/calendario");
    if (!res.ok) throw new Error("Error cargando calendario");
    const cal = await res.json();
    state.calendario = cal;
    renderCalendarioView(cal);
  } catch (err) {
    console.error(err);
  }
}

function renderCalendarioView(cal) {
  const tbody = document.getElementById("calendario-table-body");
  if (!tbody || !cal || !cal.rutas) return;

  const wdays = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

  tbody.innerHTML = Object.entries(cal.rutas)
    .map(([ruta, info]) => {
      const diasOperacion = (info.patron_semanal || [])
        .map((d) => wdays[d])
        .join(", ");

      const ventanas = (info.ventanas || [])
        .map((v) => `${v.desde} a ${v.hasta} (${v.frecuencias_dia} f/d)`)
        .join("<br>");

      return `
      <tr>
        <td><strong>${ruta}</strong></td>
        <td>${diasOperacion || '—'}</td>
        <td style="font-size: 12px;">${ventanas || 'Todo el año'}</td>
        <td style="color: var(--text-muted); font-size: 12px;">${info._nota || '—'}</td>
      </tr>
    `;
    })
    .join("");
}

function renderAirlineBadge(code, count) {
  const c = (code || "").toUpperCase();
  const cntStr = count !== undefined ? ` (${count})` : "";
  if (c === "AR") return `<span class="badge badge-ar">AR${cntStr}</span>`;
  if (c === "FO") return `<span class="badge badge-fo">Flybondi${cntStr}</span>`;
  if (c === "WJ") return `<span class="badge badge-wj">JetSMART${cntStr}</span>`;
  if (c === "LA") return `<span class="badge badge-desvio">LATAM${cntStr}</span>`;
  if (c === "G3") return `<span class="badge badge-desvio">GOL${cntStr}</span>`;
  return `<span class="badge" style="background: var(--bg-surface-elevated); color: var(--text-main);">${c}${cntStr}</span>`;
}

/* ==========================================================================
   MÓDULO DE VISUALIZACIÓN ESTADÍSTICA DE SERIES Y BANDAS (ESQUEL DATA)
   ========================================================================== */

function initSeriesEvents() {
  // 1. Selector de Enfoque (Tramo Individual vs Benchmark)
  const analysisBtns = document.querySelectorAll("#series-analysis-mode button");
  analysisBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      analysisBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const mode = btn.getAttribute("data-mode");
      state.series.analysisMode = mode;

      const indGroup = document.getElementById("controls-mode-individual");
      const benchGroup = document.getElementById("controls-mode-benchmark");
      if (mode === "individual") {
        if (indGroup) indGroup.style.display = "flex";
        if (benchGroup) benchGroup.style.display = "none";
      } else {
        if (indGroup) indGroup.style.display = "none";
        if (benchGroup) benchGroup.style.display = "flex";
      }
      loadSeriesData();
    });
  });

  // 2. Selector de Métrica ($ ARS vs $ / km)
  const metricBtns = document.querySelectorAll("#series-metric-mode button");
  metricBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      metricBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.series.metric = btn.getAttribute("data-metric");
      renderSeriesVisualization();
      renderSeriesTable();
    });
  });

  // 3. Selector de Granularidad (Semanal, Diaria, Mensual)
  const granBtns = document.querySelectorAll("#series-granularity-mode button");
  granBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      granBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.series.granularity = btn.getAttribute("data-granularity");
      loadSeriesData();
    });
  });

  // 4. Controles Modo Individual
  const origSel = document.getElementById("series-single-origin");
  const destSel = document.getElementById("series-single-dest");
  if (origSel) {
    origSel.addEventListener("change", () => {
      state.series.singleOrigin = origSel.value;
      loadSeriesData();
    });
  }
  if (destSel) {
    destSel.addEventListener("change", () => {
      state.series.singleDest = destSel.value;
      loadSeriesData();
    });
  }

  const roundtripChk = document.getElementById("series-checkbox-roundtrip");
  if (roundtripChk) {
    roundtripChk.addEventListener("change", () => {
      state.series.roundtrip = roundtripChk.checked;
      loadSeriesData();
    });
  }

  const bandsChk = document.getElementById("series-checkbox-bands");
  if (bandsChk) {
    bandsChk.addEventListener("change", () => {
      state.series.showBands = bandsChk.checked;
      renderSeriesVisualization();
    });
  }

  // 5. Controles Modo Benchmark
  const benchOrigSel = document.getElementById("series-bench-origin");
  if (benchOrigSel) {
    benchOrigSel.addEventListener("change", () => {
      state.series.benchOrigin = benchOrigSel.value;
      loadSeriesData();
    });
  }

  const destChecks = document.querySelectorAll(".bench-dest-check");
  destChecks.forEach((chk) => {
    chk.addEventListener("change", () => {
      const selected = Array.from(destChecks)
        .filter((c) => c.checked)
        .map((c) => c.value);
      state.series.benchDestinations = selected.length > 0 ? selected : ["EQS"];
      loadSeriesData();
    });
  });

  const viewTypeSel = document.getElementById("series-view-type");
  if (viewTypeSel) {
    viewTypeSel.addEventListener("change", () => {
      state.series.viewType = viewTypeSel.value;
      renderSeriesVisualization();
    });
  }

  // Redimensionamiento de ventana
  window.addEventListener("resize", () => {
    if (state.series.data && document.getElementById("tab-series")?.classList.contains("active")) {
      renderSeriesVisualization();
    }
  });
}

async function loadSeriesData() {
  const params = new URLSearchParams();
  const s = state.series;

  let rutas = [];
  if (s.analysisMode === "individual") {
    const o = s.singleOrigin || "BUE";
    const d = s.singleDest || "EQS";
    rutas.push(`${o}>${d}`);
    if (s.roundtrip && o !== d) {
      rutas.push(`${d}>${o}`);
    }
  } else {
    const o = s.benchOrigin || "BUE";
    (s.benchDestinations || ["EQS", "BRC"]).forEach((d) => {
      if (o !== d) rutas.push(`${o}>${d}`);
    });
  }

  if (rutas.length === 0) rutas = ["BUE>EQS"];

  params.set("rutas", rutas.join(","));
  params.set("agrupacion", s.granularity || "semanal");
  params.set("metrica", s.metric || "precio_ars");

  try {
    const res = await fetch(`/api/series?${params.toString()}`);
    if (!res.ok) throw new Error("Error cargando series temporales");
    const data = await res.json();
    state.series.data = data;
    renderSeriesVisualization();
    renderSeriesTable();
    updateGuiaLectura();
  } catch (err) {
    console.error("Error en loadSeriesData:", err);
  }
}

function getRouteVisualMeta(rutaStr) {
  const r = (rutaStr || "").toUpperCase().replace(/\s/g, "");
  if (r === "BUE>EQS") return { color: "#3182ce", bgIqr: "rgba(49, 130, 206, 0.25)", label: "BUE > EQS (Ida)", name: "Esquel Ida" };
  if (r === "EQS>BUE") return { color: "#10b981", bgIqr: "rgba(16, 185, 129, 0.22)", label: "EQS > BUE (Vuelta)", name: "Esquel Vuelta" };
  if (r.includes("BRC")) return { color: "#f59e0b", bgIqr: "rgba(245, 158, 11, 0.22)", label: rutaStr, name: "Bariloche" };
  if (r.includes("CPC")) return { color: "#8b5cf6", bgIqr: "rgba(139, 92, 246, 0.22)", label: rutaStr, name: "Chapelco" };
  if (r.includes("COR")) return { color: "#06b6d4", bgIqr: "rgba(6, 182, 212, 0.22)", label: rutaStr, name: "Córdoba" };
  return { color: "#64748b", bgIqr: "rgba(100, 116, 139, 0.2)", label: rutaStr, name: rutaStr };
}

function renderSeriesVisualization() {
  const data = state.series.data;
  const container = document.getElementById("series-canvas-container");
  const legend = document.getElementById("series-chart-legend");
  const titleEl = document.getElementById("series-chart-title");
  const subEl = document.getElementById("series-chart-sub");

  if (!container || !data || !data.rutas || data.rutas.length === 0) return;

  const isKm = state.series.metric === "tarifa_km_ars";
  const unitLabel = isKm ? "ARS/km" : "ARS";

  // Actualizar Título y Subtítulo
  if (state.series.analysisMode === "individual") {
    const r0 = data.rutas[0]?.ruta || "BUE > EQS";
    const hasRt = data.rutas.length > 1;
    if (titleEl) titleEl.textContent = `Dispersión y Tendencia de Tarifas: ${r0} ${hasRt ? '(Ida y Vuelta)' : ''}`;
    if (subEl) subEl.textContent = `Banda gris: Mín-Máx · Banda azul: 50% central (IQR) · Línea: Mediana (${unitLabel})`;
  } else {
    const o = state.series.benchOrigin || "BUE";
    if (titleEl) titleEl.textContent = `Benchmark de Tarifas desde ${o}: Esquel vs Bariloche / Chapelco`;
    if (subEl) subEl.textContent = `Comparación transversal en ${unitLabel} · ${data.agrupacion} a 180 días`;
  }

  // Actualizar Leyenda Dinámica
  if (legend) {
    let legendHtml = "";
    data.rutas.forEach((r) => {
      const meta = getRouteVisualMeta(r.ruta);
      legendHtml += `
        <div class="series-legend-item">
          <span class="legend-line-sample" style="background: ${meta.color};"></span>
          <span>${meta.label}</span>
        </div>
      `;
    });
    if (state.series.showBands && state.series.viewType !== "barras") {
      legendHtml += `
        <div class="series-legend-item">
          <span class="legend-rect-sample" style="background: rgba(49, 130, 206, 0.3); border: 1px solid rgba(49, 130, 206, 0.5);"></span>
          <span>Rango IQR (P25 - P75)</span>
        </div>
        <div class="series-legend-item">
          <span class="legend-rect-sample" style="background: rgba(148, 163, 184, 0.2); border: 1px dashed rgba(148, 163, 184, 0.4);"></span>
          <span>Mínimo - Máximo</span>
        </div>
      `;
    }
    legend.innerHTML = legendHtml;
  }

  // Renderizar según Vista Seleccionada
  if (state.series.analysisMode === "benchmark" && state.series.viewType === "multiples") {
    renderSmallMultiplesChart(data, container);
  } else if (state.series.analysisMode === "benchmark" && state.series.viewType === "barras") {
    renderMonthlyBarChart(data, container);
  } else {
    renderEnvolventeChart(data, container);
  }
}

function renderEnvolventeChart(data, container) {
  const isKm = state.series.metric === "tarifa_km_ars";
  const valKeyMed = isKm ? "tarifa_km_mediana" : "precio_mediana";
  const valKeyMin = isKm ? "tarifa_km_min" : "precio_min";
  const valKeyMax = isKm ? "tarifa_km_max" : "precio_max";
  const valKeyP25 = isKm ? "tarifa_km_p25" : "precio_p25";
  const valKeyP75 = isKm ? "tarifa_km_p75" : "precio_p75";

  // Dimensiones SVG
  const width = 880;
  const height = 420;
  const padLeft = 85;
  const padRight = 30;
  const padTop = 35;
  const padBottom = 55;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  // Determinar número de buckets y rango de valores
  const samplePoints = data.rutas[0]?.puntos || [];
  const n = samplePoints.length;
  if (n === 0) {
    container.innerHTML = `<div class="empty-state">No hay puntos para graficar.</div>`;
    return;
  }

  let globalMax = 0;
  data.rutas.forEach((r) => {
    (r.puntos || []).forEach((p) => {
      if (p.tiene_datos) {
        const mx = state.series.showBands ? (p[valKeyMax] || p[valKeyMed] || 0) : (p[valKeyMed] || 0);
        if (mx > globalMax) globalMax = mx;
      }
    });
  });

  if (globalMax === 0) globalMax = isKm ? 150 : 300000;
  // Margen superior del 8%
  globalMax = globalMax * 1.08;

  // Funciones de escala
  const getX = (i) => padLeft + (n > 1 ? (i / (n - 1)) * plotW : plotW / 2);
  const getY = (val) => padTop + plotH - (val / globalMax) * plotH;

  // Construcción del SVG
  let svg = `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">`;

  // 1. Rejilla horizontal y etiquetas del eje Y
  const yTicksCount = 5;
  for (let i = 0; i <= yTicksCount; i++) {
    const tickVal = (globalMax / yTicksCount) * i;
    const yPos = getY(tickVal);
    const labelTxt = isKm ? `${Math.round(tickVal)}/km` : formatARS.format(tickVal);

    svg += `
      <line x1="${padLeft}" y1="${yPos}" x2="${padLeft + plotW}" y2="${yPos}" stroke="var(--border-subtle)" stroke-dasharray="2,4" stroke-width="1" />
      <text x="${padLeft - 10}" y="${yPos + 4}" font-size="11" fill="var(--text-muted)" text-anchor="end" font-family="inherit">${labelTxt}</text>
    `;
  }

  // 2. Líneas verticales para Hitos Turísticos oficiales
  const hitos = data.hitos || [];
  const hitosDrawn = new Set();
  samplePoints.forEach((p, idx) => {
    if (p.hito && !hitosDrawn.has(p.hito)) {
      hitosDrawn.add(p.hito);
      const hX = getX(idx);
      svg += `
        <line x1="${hX}" y1="${padTop}" x2="${hX}" y2="${padTop + plotH}" stroke="rgba(239, 68, 68, 0.4)" stroke-dasharray="3,3" stroke-width="1.5" />
        <circle cx="${hX}" cy="${padTop - 8}" r="3" fill="#ef4444" />
        <text x="${hX}" y="${padTop - 12}" font-size="9" fill="#ef4444" font-weight="600" text-anchor="middle" font-family="inherit">★ ${p.hito}</text>
      `;
    }
  });

  // 3. Bandas de dispersión (si están habilitadas)
  if (state.series.showBands) {
    data.rutas.forEach((r, rIdx) => {
      const meta = getRouteVisualMeta(r.ruta);
      const pts = r.puntos || [];
      const validIndices = [];
      pts.forEach((p, idx) => {
        if (p.tiene_datos && p[valKeyMin] !== null && p[valKeyMax] !== null) validIndices.push(idx);
      });

      if (validIndices.length > 1) {
        // Banda Mínimo - Máximo (gris claro)
        let pathMinMax = `M ${getX(validIndices[0])} ${getY(pts[validIndices[0]][valKeyMax])}`;
        for (let k = 1; k < validIndices.length; k++) {
          const idx = validIndices[k];
          pathMinMax += ` L ${getX(idx)} ${getY(pts[idx][valKeyMax])}`;
        }
        for (let k = validIndices.length - 1; k >= 0; k--) {
          const idx = validIndices[k];
          pathMinMax += ` L ${getX(idx)} ${getY(pts[idx][valKeyMin])}`;
        }
        pathMinMax += " Z";
        svg += `<path d="${pathMinMax}" fill="rgba(148, 163, 184, 0.16)" />`;

        // Banda Intercuartil IQR (P25 - P75) coloreada
        let pathIqr = `M ${getX(validIndices[0])} ${getY(pts[validIndices[0]][valKeyP75])}`;
        for (let k = 1; k < validIndices.length; k++) {
          const idx = validIndices[k];
          pathIqr += ` L ${getX(idx)} ${getY(pts[idx][valKeyP75])}`;
        }
        for (let k = validIndices.length - 1; k >= 0; k--) {
          const idx = validIndices[k];
          pathIqr += ` L ${getX(idx)} ${getY(pts[idx][valKeyP25])}`;
        }
        pathIqr += " Z";
        svg += `<path d="${pathIqr}" fill="${meta.bgIqr}" />`;
      }
    });
  }

  // 4. Líneas de tendencia central (Mediana) y puntos
  data.rutas.forEach((r, rIdx) => {
    const meta = getRouteVisualMeta(r.ruta);
    const pts = r.puntos || [];
    let pathMed = "";
    let isDrawing = false;

    pts.forEach((p, idx) => {
      if (p.tiene_datos && p[valKeyMed] !== null) {
        const xPos = getX(idx);
        const yPos = getY(p[valKeyMed]);
        if (!isDrawing) {
          pathMed += `M ${xPos} ${yPos}`;
          isDrawing = true;
        } else {
          pathMed += ` L ${xPos} ${yPos}`;
        }
      } else {
        isDrawing = false;
      }
    });

    if (pathMed) {
      svg += `<path d="${pathMed}" fill="none" stroke="${meta.color}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round" />`;
    }

    // Puntos marcadores
    pts.forEach((p, idx) => {
      if (p.tiene_datos && p[valKeyMed] !== null) {
        const xPos = getX(idx);
        const yPos = getY(p[valKeyMed]);
        svg += `<circle cx="${xPos}" cy="${yPos}" r="3.5" fill="${meta.color}" stroke="var(--bg-surface)" stroke-width="1.5" class="chart-point" data-idx="${idx}" />`;
      }
    });
  });

  // 5. Eje X y etiquetas temporales
  const labelStep = n > 20 ? Math.ceil(n / 10) : (n > 10 ? 2 : 1);
  samplePoints.forEach((p, idx) => {
    if (idx % labelStep === 0 || idx === n - 1) {
      const xPos = getX(idx);
      svg += `
        <line x1="${xPos}" y1="${padTop + plotH}" x2="${xPos}" y2="${padTop + plotH + 5}" stroke="var(--border-subtle)" stroke-width="1" />
        <text x="${xPos}" y="${padTop + plotH + 20}" font-size="11" fill="var(--text-muted)" text-anchor="middle" font-family="inherit">${p.etiqueta}</text>
      `;
    }
  });

  // 6. Crosshair vertical invisible y overlay interactivo
  svg += `
    <line id="svg-crosshair" x1="0" y1="${padTop}" x2="0" y2="${padTop + plotH}" stroke="var(--text-muted)" stroke-dasharray="3,3" stroke-width="1" style="display: none;" />
    <rect id="svg-overlay" x="${padLeft}" y="${padTop}" width="${plotW}" height="${plotH}" fill="transparent" style="cursor: crosshair;" />
  `;

  svg += `</svg>`;
  container.innerHTML = svg;

  // 7. Eventos de interacción del Tooltip
  setupChartInteractivity(container, samplePoints, data.rutas, padLeft, plotW, n, isKm);
}

function renderSmallMultiplesChart(data, container) {
  const isKm = state.series.metric === "tarifa_km_ars";
  const valKeyMed = isKm ? "tarifa_km_mediana" : "precio_mediana";
  const valKeyMin = isKm ? "tarifa_km_min" : "precio_min";
  const valKeyMax = isKm ? "tarifa_km_max" : "precio_max";
  const valKeyP25 = isKm ? "tarifa_km_p25" : "precio_p25";
  const valKeyP75 = isKm ? "tarifa_km_p75" : "precio_p75";

  let globalMax = 0;
  data.rutas.forEach((r) => {
    (r.puntos || []).forEach((p) => {
      if (p.tiene_datos) {
        const mx = p[valKeyMax] || p[valKeyMed] || 0;
        if (mx > globalMax) globalMax = mx;
      }
    });
  });
  if (globalMax === 0) globalMax = isKm ? 150 : 300000;
  globalMax = globalMax * 1.08;

  let html = `<div class="small-multiples-grid">`;

  data.rutas.forEach((r) => {
    const meta = getRouteVisualMeta(r.ruta);
    const pts = r.puntos || [];
    const n = pts.length;
    const w = 400;
    const h = 220;
    const padL = 60;
    const padR = 20;
    const padT = 20;
    const padB = 40;
    const pW = w - padL - padR;
    const pH = h - padT - padB;

    const getX = (i) => padL + (n > 1 ? (i / (n - 1)) * pW : pW / 2);
    const getY = (val) => padT + pH - (val / globalMax) * pH;

    let svg = `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">`;

    // Ejes Y
    for (let i = 0; i <= 3; i++) {
      const tVal = (globalMax / 3) * i;
      const yP = getY(tVal);
      const lbl = isKm ? `${Math.round(tVal)}/km` : `$${Math.round(tVal / 1000)}k`;
      svg += `
        <line x1="${padL}" y1="${yP}" x2="${padL + pW}" y2="${yP}" stroke="var(--border-subtle)" stroke-dasharray="2,4" />
        <text x="${padL - 6}" y="${yP + 4}" font-size="10" fill="var(--text-muted)" text-anchor="end">${lbl}</text>
      `;
    }

    // Banda IQR
    const validIdxs = [];
    pts.forEach((p, idx) => {
      if (p.tiene_datos && p[valKeyMin] !== null) validIdxs.push(idx);
    });

    if (validIdxs.length > 1) {
      let pathIqr = `M ${getX(validIdxs[0])} ${getY(pts[validIdxs[0]][valKeyP75])}`;
      for (let k = 1; k < validIdxs.length; k++) pathIqr += ` L ${getX(validIdxs[k])} ${getY(pts[validIdxs[k]][valKeyP75])}`;
      for (let k = validIdxs.length - 1; k >= 0; k--) pathIqr += ` L ${getX(validIdxs[k])} ${getY(pts[validIdxs[k]][valKeyP25])}`;
      pathIqr += " Z";
      svg += `<path d="${pathIqr}" fill="${meta.bgIqr}" />`;
    }

    // Línea Mediana
    let pathMed = "";
    let isDr = false;
    pts.forEach((p, idx) => {
      if (p.tiene_datos && p[valKeyMed] !== null) {
        const xP = getX(idx);
        const yP = getY(p[valKeyMed]);
        if (!isDr) { pathMed += `M ${xP} ${yP}`; isDr = true; }
        else { pathMed += ` L ${xP} ${yP}`; }
      } else { isDr = false; }
    });
    if (pathMed) svg += `<path d="${pathMed}" fill="none" stroke="${meta.color}" stroke-width="2.2" />`;

    // Eje X
    const step = Math.ceil(n / 5);
    pts.forEach((p, idx) => {
      if (idx % step === 0 || idx === n - 1) {
        const xP = getX(idx);
        svg += `<text x="${xP}" y="${padT + pH + 18}" font-size="10" fill="var(--text-muted)" text-anchor="middle">${p.etiqueta}</text>`;
      }
    });

    svg += `</svg>`;

    html += `
      <div class="small-multiple-card">
        <div class="small-multiple-title">
          <span style="color: ${meta.color};">${r.ruta}</span>
          <span style="font-size: 11px; font-weight: normal; color: var(--text-muted);">${r.total_vuelos_relevantes} vuelos · ${r.distancia_km} km</span>
        </div>
        ${svg}
      </div>
    `;
  });

  html += `</div>`;
  container.innerHTML = html;
}

function renderMonthlyBarChart(data, container) {
  const isKm = state.series.metric === "tarifa_km_ars";
  const valKeyMed = isKm ? "tarifa_km_mediana" : "precio_mediana";
  const valKeyMin = isKm ? "tarifa_km_min" : "precio_min";
  const valKeyMax = isKm ? "tarifa_km_max" : "precio_max";

  // Agrupar datos mensuales si la agrupación no es mensual
  const samplePts = data.rutas[0]?.puntos || [];
  const mesesMap = {};

  data.rutas.forEach((r) => {
    (r.puntos || []).forEach((p) => {
      if (p.tiene_datos && p[valKeyMed] !== null) {
        const mKey = p.fecha_inicio.substring(0, 7);
        if (!mesesMap[mKey]) mesesMap[mKey] = { mesKey: mKey, etiqueta: p.etiqueta, rutas: {} };
        mesesMap[mKey].rutas[r.ruta] = p;
      }
    });
  });

  const mesesKeys = Object.keys(mesesMap).sort();
  if (mesesKeys.length === 0) {
    container.innerHTML = `<div class="empty-state">No hay suficientes datos agregados para la vista de barras.</div>`;
    return;
  }

  const w = 880;
  const h = 400;
  const padL = 80;
  const padR = 30;
  const padT = 30;
  const padB = 60;
  const pW = w - padL - padR;
  const pH = h - padT - padB;

  let globalMax = 0;
  mesesKeys.forEach((mK) => {
    Object.values(mesesMap[mK].rutas).forEach((p) => {
      const mx = p[valKeyMax] || p[valKeyMed] || 0;
      if (mx > globalMax) globalMax = mx;
    });
  });
  if (globalMax === 0) globalMax = isKm ? 150 : 300000;
  globalMax = globalMax * 1.1;

  const getY = (val) => padT + pH - (val / globalMax) * pH;

  let svg = `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">`;

  // Rejilla Y
  for (let i = 0; i <= 4; i++) {
    const tVal = (globalMax / 4) * i;
    const yP = getY(tVal);
    const lbl = isKm ? `${Math.round(tVal)}/km` : formatARS.format(tVal);
    svg += `
      <line x1="${padL}" y1="${yP}" x2="${padL + pW}" y2="${yP}" stroke="var(--border-subtle)" stroke-dasharray="2,4" />
      <text x="${padL - 10}" y="${yP + 4}" font-size="11" fill="var(--text-muted)" text-anchor="end">${lbl}</text>
    `;
  }

  // Barras agrupadas
  const numGrupos = mesesKeys.length;
  const groupW = pW / numGrupos;
  const numRutas = data.rutas.length;
  const barW = Math.max(12, Math.min(36, (groupW * 0.7) / numRutas));

  mesesKeys.forEach((mK, gIdx) => {
    const gCenterX = padL + gIdx * groupW + groupW / 2;
    const startX = gCenterX - (numRutas * barW) / 2;

    data.rutas.forEach((r, rIdx) => {
      const p = mesesMap[mK].rutas[r.ruta];
      const meta = getRouteVisualMeta(r.ruta);
      const bX = startX + rIdx * barW;

      if (p && p[valKeyMed] !== null) {
        const medY = getY(p[valKeyMed]);
        const barH = padT + pH - medY;

        // Barra de Mediana
        svg += `
          <rect x="${bX}" y="${medY}" width="${barW - 2}" height="${barH}" fill="${meta.color}" rx="3" opacity="0.85" />
        `;

        // Bigote Min - Max
        if (p[valKeyMin] !== null && p[valKeyMax] !== null) {
          const minY = getY(p[valKeyMin]);
          const maxY = getY(p[valKeyMax]);
          const whiskerX = bX + (barW - 2) / 2;
          svg += `
            <line x1="${whiskerX}" y1="${minY}" x2="${whiskerX}" y2="${maxY}" stroke="var(--text-main)" stroke-width="1.5" />
            <line x1="${whiskerX - 4}" y1="${minY}" x2="${whiskerX + 4}" y2="${minY}" stroke="var(--text-main)" stroke-width="1.5" />
            <line x1="${whiskerX - 4}" y1="${maxY}" x2="${whiskerX + 4}" y2="${maxY}" stroke="var(--text-main)" stroke-width="1.5" />
          `;
        }
      }
    });

    // Etiqueta del Mes
    svg += `
      <text x="${gCenterX}" y="${padT + pH + 24}" font-size="12" font-weight="600" fill="var(--text-main)" text-anchor="middle">${mesesMap[mK].etiqueta || mK}</text>
    `;
  });

  svg += `</svg>`;
  container.innerHTML = svg;
}

function setupChartInteractivity(container, samplePoints, rutas, padLeft, plotW, n, isKm) {
  const overlay = container.querySelector("#svg-overlay");
  const crosshair = container.querySelector("#svg-crosshair");
  const tooltip = document.getElementById("series-tooltip");
  if (!overlay || !tooltip) return;

  const valKeyMed = isKm ? "tarifa_km_mediana" : "precio_mediana";
  const valKeyMin = isKm ? "tarifa_km_min" : "precio_min";
  const valKeyMax = isKm ? "tarifa_km_max" : "precio_max";
  const valKeyP25 = isKm ? "tarifa_km_p25" : "precio_p25";
  const valKeyP75 = isKm ? "tarifa_km_p75" : "precio_p75";
  const unitSuffix = isKm ? "/km" : "";

  overlay.addEventListener("mousemove", (e) => {
    const rect = overlay.getBoundingClientRect();
    const svgRelX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, svgRelX / rect.width));
    const idx = Math.round(ratio * (n - 1));
    const p = samplePoints[idx];
    if (!p) return;

    const xPos = padLeft + (n > 1 ? (idx / (n - 1)) * plotW : plotW / 2);

    // Posicionar crosshair
    if (crosshair) {
      crosshair.setAttribute("x1", xPos);
      crosshair.setAttribute("x2", xPos);
      crosshair.style.display = "block";
    }

    // Contenido del tooltip
    let rowsHtml = "";
    rutas.forEach((r) => {
      const pt = r.puntos[idx];
      const meta = getRouteVisualMeta(r.ruta);
      if (pt && pt.tiene_datos && pt[valKeyMed] !== null) {
        const medFmt = isKm ? `${pt[valKeyMed].toFixed(1)}/km` : formatARS.format(pt[valKeyMed]);
        const iqrFmt = isKm
          ? `${pt[valKeyP25]?.toFixed(1)} – ${pt[valKeyP75]?.toFixed(1)}/km`
          : `${formatARS.format(pt[valKeyP25])} – ${formatARS.format(pt[valKeyP75])}`;
        const minMaxFmt = isKm
          ? `${pt[valKeyMin]?.toFixed(1)} – ${pt[valKeyMax]?.toFixed(1)}/km`
          : `${formatARS.format(pt[valKeyMin])} – ${formatARS.format(pt[valKeyMax])}`;

        rowsHtml += `
          <div style="margin-top: 6px; padding-top: 4px; border-top: 1px solid var(--border-subtle);">
            <div style="font-weight: 700; color: ${meta.color}; margin-bottom: 2px;">
              ${r.ruta}: <strong>${medFmt}</strong> <span style="font-size: 10px; font-weight: normal; color: var(--text-muted);">(Mediana)</span>
            </div>
            <div class="tooltip-row" style="font-size: 11px;">
              <span>Rango IQR (P25-P75):</span>
              <strong>${iqrFmt}</strong>
            </div>
            <div class="tooltip-row" style="font-size: 11px;">
              <span>Rango Mín-Máx:</span>
              <span>${minMaxFmt}</span>
            </div>
            <div class="tooltip-row" style="font-size: 10px; color: var(--text-muted);">
              <span>Más económico:</span>
              <span>${pt.aerolinea_minima} ${pt.vuelo_minimo} (${pt.hora_minima})</span>
            </div>
          </div>
        `;
      } else {
        rowsHtml += `
          <div style="margin-top: 6px; font-size: 11px; color: var(--text-muted);">
            <strong style="color: ${meta.color};">${r.ruta}</strong>: Sin vuelos programados
          </div>
        `;
      }
    });

    const hitoBadge = p.hito ? `<span class="badge badge-warning" style="font-size: 10px;">★ ${p.hito}</span>` : "";

    tooltip.innerHTML = `
      <div class="tooltip-header">
        <span>${p.etiqueta_larga || p.etiqueta}</span>
        ${hitoBadge}
      </div>
      ${rowsHtml}
    `;

    tooltip.style.display = "block";
    const ttRect = tooltip.getBoundingClientRect();
    const cardRect = container.getBoundingClientRect();

    let left = e.clientX - cardRect.left + 15;
    if (left + ttRect.width > cardRect.width) left = left - ttRect.width - 30;
    let top = e.clientY - cardRect.top - 20;
    if (top < 10) top = 10;

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  });

  overlay.addEventListener("mouseleave", () => {
    if (crosshair) crosshair.style.display = "none";
    if (tooltip) tooltip.style.display = "none";
  });
}

function renderBrechasBenchmark() {
  const container = document.getElementById("series-brechas-container");
  const data = state.series.data;
  if (!container) return;

  const b = data?.benchmark_brechas;
  if (!b) {
    container.innerHTML = "";
    container.style.display = "none";
    return;
  }

  container.style.display = "block";
  const tit = b.titular;
  const dom = b.domestica;
  const agr = b.agrupada;

  const titVal = tit?.valor_pct !== null && tit?.valor_pct !== undefined ? `+${tit.valor_pct.toFixed(1)}%` : "—";
  const domVal = dom?.valor_pct !== null && dom?.valor_pct !== undefined ? `+${dom.valor_pct.toFixed(1)}%` : "—";
  const agrVal = agr?.valor_pct !== null && agr?.valor_pct !== undefined ? `+${agr.valor_pct.toFixed(1)}%` : "—";

  const titBadge = tit?.es_preliminar ? '<span class="badge badge-conf-c">Preliminar (I8)</span>' : '<span class="badge badge-conf-b">Oficial B</span>';
  const domBadge = dom?.es_preliminar ? '<span class="badge badge-conf-c">Preliminar (I8)</span>' : '<span class="badge badge-conf-b">Oficial B</span>';
  const agrBadge = '<span class="badge badge-conf-c">Desaconsejada (I8)</span>';

  container.innerHTML = `
    <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-muted); margin-bottom: 8px;">
      Auditoría de Brecha Tarifaria: Tres Versiones de Evidencia (Invariante I12)
    </div>
    <div class="brecha-benchmark-grid">
      <!-- 1. Cifra Titular: AR vs AR -->
      <div class="brecha-card brecha-card-titular">
        <div>
          <div class="brecha-card-header">
            <span class="brecha-card-title">1. Prima de Monopolio AR vs AR</span>
            ${titBadge}
          </div>
          <div class="brecha-card-value" style="color: var(--accent);">${titVal}</div>
          <div class="brecha-card-desc">${tit.definicion}</div>
        </div>
        <div class="brecha-card-meta">
          <span>Tarifa: EQS <strong>$${tit.tarifa_km_eqs}/km</strong> vs BRC <strong>$${tit.tarifa_km_brc}/km</strong></span>
          <span style="font-weight: 600;">n: EQS ${tit.n_eqs} · BRC ${tit.n_brc}</span>
        </div>
      </div>

      <!-- 2. Brecha Doméstica: Cabotaje Genuino -->
      <div class="brecha-card">
        <div>
          <div class="brecha-card-header">
            <span class="brecha-card-title">2. Brecha Doméstica Competitiva</span>
            ${domBadge}
          </div>
          <div class="brecha-card-value" style="color: var(--warning);">${domVal}</div>
          <div class="brecha-card-desc">${dom.definicion}</div>
        </div>
        <div class="brecha-card-meta">
          <span>Mediana: EQS <strong>$${dom.tarifa_km_eqs}/km</strong> vs BRC Dom <strong>$${dom.tarifa_km_brc}/km</strong></span>
          <span style="font-weight: 600;">n: EQS ${dom.n_eqs} · BRC ${dom.n_brc}</span>
        </div>
      </div>

      <!-- 3. Brecha Agrupada General -->
      <div class="brecha-card" style="opacity: 0.85;">
        <div>
          <div class="brecha-card-header">
            <span class="brecha-card-title">3. Brecha Agrupada General (Global)</span>
            ${agrBadge}
          </div>
          <div class="brecha-card-value" style="color: var(--text-muted);">${agrVal}</div>
          <div class="brecha-card-desc">${agr.definicion}</div>
        </div>
        <div class="brecha-card-meta">
          <span>Mediana: EQS <strong>$${agr.tarifa_km_eqs}/km</strong> vs BRC All <strong>$${agr.tarifa_km_brc}/km</strong></span>
          <span style="font-weight: 600;">n: EQS ${agr.n_eqs} · BRC ${agr.n_brc}</span>
        </div>
      </div>
    </div>
  `;
}

function renderSeriesTable() {
  renderBrechasBenchmark();

  const tbody = document.getElementById("series-data-table-body");
  const data = state.series.data;
  if (!tbody || !data || !data.rutas) return;

  const isKm = state.series.metric === "tarifa_km_ars";
  const valKeyMed = isKm ? "tarifa_km_mediana" : "precio_mediana";
  const valKeyMin = isKm ? "tarifa_km_min" : "precio_min";
  const valKeyMax = isKm ? "tarifa_km_max" : "precio_max";
  const valKeyP25 = isKm ? "tarifa_km_p25" : "precio_p25";
  const valKeyP75 = isKm ? "tarifa_km_p75" : "precio_p75";

  let html = "";

  data.rutas.forEach((r) => {
    const meta = getRouteVisualMeta(r.ruta);
    (r.puntos || []).forEach((p) => {
      if (p.tiene_datos && p[valKeyMed] !== null) {
        const medFmt = isKm ? `${p[valKeyMed].toFixed(1)}/km` : formatARS.format(p[valKeyMed]);
        const iqrFmt = isKm
          ? `${p[valKeyP25]?.toFixed(1)} – ${p[valKeyP75]?.toFixed(1)}`
          : `${formatARS.format(p[valKeyP25])} – ${formatARS.format(p[valKeyP75])}`;
        const minFmt = isKm ? `${p[valKeyMin]?.toFixed(1)}` : formatARS.format(p[valKeyMin]);
        const maxFmt = isKm ? `${p[valKeyMax]?.toFixed(1)}` : formatARS.format(p[valKeyMax]);
        const kmUnitFmt = p.tarifa_km_mediana ? `${p.tarifa_km_mediana.toFixed(1)}/km` : "—";
        const arKmFmt = p.tarifa_km_ar_mediana ? `${p.tarifa_km_ar_mediana.toFixed(1)}/km` : "—";
        const domKmFmt = p.tarifa_km_dom_mediana ? `${p.tarifa_km_dom_mediana.toFixed(1)}/km` : "—";
        const vueloBarato = p.vuelo_minimo && p.vuelo_minimo !== "—" ? `${p.aerolinea_minima} ${p.vuelo_minimo}` : "—";
        const hitoBadge = p.hito ? `<span class="badge badge-warning" style="font-size: 10px;">★ ${p.hito}</span>` : "—";
        const vuelosBreakdown = `${p.vuelos_ar || 0} AR · ${p.vuelos_dom || 0} dom (${p.vuelos_disponibles})`;

        html += `
          <tr>
            <td><strong>${p.etiqueta_larga || p.etiqueta}</strong></td>
            <td><span style="color: ${meta.color}; font-weight: 700;">${r.ruta}</span></td>
            <td class="numeric"><strong>${medFmt}</strong> <span class="badge badge-conf-b">B</span></td>
            <td class="numeric" style="color: var(--text-muted);">${kmUnitFmt}</td>
            <td class="numeric" style="color: var(--accent); font-weight: 600;">${arKmFmt}</td>
            <td class="numeric" style="color: var(--text-muted);">${domKmFmt}</td>
            <td class="numeric" style="color: var(--text-muted); font-size: 12px;">${iqrFmt}</td>
            <td class="numeric">${minFmt}</td>
            <td class="numeric">${maxFmt}</td>
            <td>${vueloBarato}</td>
            <td class="numeric" title="AR: ${p.vuelos_ar || 0}, Cabotaje: ${p.vuelos_dom || 0}, Total: ${p.vuelos_disponibles}">${vuelosBreakdown}</td>
            <td>${hitoBadge}</td>
          </tr>
        `;
      }
    });
  });

  if (!html) {
    html = `<tr><td colspan="12" style="text-align: center; color: var(--text-muted); padding: 24px;">No se registraron datos en el período seleccionado.</td></tr>`;
  }

  tbody.innerHTML = html;
}

function updateGuiaLectura() {
  const data = state.series.data;
  if (!data) return;

  const titleEl = document.getElementById("guia-title");
  const queEl = document.getElementById("guia-que-muestra");
  const porQueEl = document.getElementById("guia-por-que");
  const ejTituloEl = document.getElementById("guia-ejemplo-titulo");
  const ejTextoEl = document.getElementById("guia-ejemplo-texto");

  if (state.series.analysisMode === "individual") {
    const r = data.rutas[0]?.ruta || "BUE > EQS";
    if (titleEl) titleEl.textContent = `Tarifas sobre el horizonte a 180 días (${r})`;
    if (queEl) queEl.textContent = `La evolución de precios y la dispersión habitual de vuelos para ${r}. Permite identificar semanas de alta demanda y oportunidades de compra anticipada.`;
    if (porQueEl) porQueEl.textContent = `Esquel cuenta con una oferta aérea acotada bajo monopolio de AR. Conocer la banda habitual (IQR azul) y la tarifa por km permite auditar la accesibilidad real del destino.`;
    if (ejTituloEl) ejTituloEl.textContent = `EJEMPLO: ASIMETRÍA DE FLUJO Y VERANO`;
    if (ejTextoEl) ejTextoEl.textContent = `Al cruzar Ida y Vuelta, se observa que en el inicio de enero la ida BUE>EQS se encarece drásticamente mientras la vuelta EQS>BUE se mantiene baja, invirtiéndose el patrón al final de la quincena.`;
  } else {
    if (titleEl) titleEl.textContent = `Evidencia de Paridad: Prima de Monopolio y Brecha`;
    if (queEl) queEl.textContent = `Comparación directa del costo de acceso a Esquel contra Bariloche y Chapelco, normalizada por distancia ($/km) y desglosada en tres versiones metodológicas.`;
    if (porQueEl) porQueEl.textContent = `La comparación fuerte es Aerolíneas Argentinas contra Aerolíneas Argentinas (prima_monopolio_ar_pct = +155,5%): controla la misma flota (Boeing 737 / Embraer), misma estructura de costos y mismo emisor (BUE). La única variable que cambia es la presencia de competencia (Flybondi y JetSMART en Bariloche vs monopolio en Esquel).`;
    if (ejTituloEl) ejTituloEl.textContent = `TRES VERSIONES DE LA BRECHA`;
    if (ejTextoEl) ejTextoEl.textContent = `1. Prima Monopolio AR (+155,5%): AR vs AR dentro de celda comparable (la evidencia más sólida ante ANAC).\n2. Brecha Doméstica (+111,0%): Esquel vs cabotaje genuino de Bariloche.\n3. Brecha Agrupada (+52,3%): Comparación global sin control de celda, desaconsejada porque diluye la brecha mezclando calendarios dispares.`;
  }
}

