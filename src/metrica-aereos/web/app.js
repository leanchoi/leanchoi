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
  bitacora: [],
  canario: null,
  calendario: null,
};

// Inicialización
document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  initTabs();
  initFilterEvents();
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
}

async function loadAllData() {
  await Promise.all([
    loadStatus(),
    loadRutas(),
    loadVuelos(),
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

  const curOrig = origenSel.value;
  const curDest = destinoSel.value;

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
  params.set("limit", "150");

  try {
    const res = await fetch(`/api/vuelos?${params.toString()}`);
    if (!res.ok) throw new Error("Error cargando vuelos");
    const vuelos = await res.json();
    state.vuelos = vuelos;
    renderVuelosTable(vuelos);
  } catch (err) {
    console.error(err);
  }
}

function renderVuelosTable(vuelos) {
  const tbody = document.getElementById("vuelos-table-body");
  const empty = document.getElementById("vuelos-empty-state");
  const countSpan = document.getElementById("vuelos-count-badge");
  if (!tbody) return;

  if (countSpan) countSpan.textContent = `${vuelos.length} resultados`;

  if (!vuelos || vuelos.length === 0) {
    tbody.innerHTML = "";
    if (empty) empty.style.display = "flex";
    return;
  }
  if (empty) empty.style.display = "none";

  tbody.innerHTML = vuelos
    .map((v) => {
      const aeroBadge = renderAirlineBadge(v.airline_code || "OTRA");
      const isCheapest = v.is_cheapest_of_query
        ? `<span class="badge badge-ok" style="font-size: 10px;">Más barata</span>`
        : "";

      let escalas = "";
      if (v.itinerario_relevante === false) {
        escalas = `<span class="badge badge-desvio" title="${v.motivo_irrelevancia || 'Desvío'}">Desvío: ${v.motivo_irrelevancia || 'Internacional'}</span>`;
      } else if (v.stops_count === 0) {
        escalas = `<span style="color: var(--success); font-weight: 600;">Directo</span>`;
      } else {
        escalas = `<span style="color: var(--warning);">${v.stops_count} escala (${(v.stopover_iatas || []).join(",")})</span>`;
      }

      return `
      <tr>
        <td><strong>${v.origin_iata} > ${v.dest_iata}</strong></td>
        <td>${v.flight_date}</td>
        <td>${aeroBadge} <span style="font-size: 12px; color: var(--text-muted);">${v.flight_numbers || ''}</span></td>
        <td>${v.depart_local ? v.depart_local.split(' ')[1] : '—'} → ${v.arrive_local ? v.arrive_local.split(' ')[1] : '—'}</td>
        <td>${escalas}</td>
        <td class="numeric ${v.is_cheapest_of_query ? 'price-cheapest' : 'price-tag'}">
          ${v.price_ars ? formatARS.format(v.price_ars) : '—'} ${isCheapest}
        </td>
        <td class="numeric" style="color: var(--text-muted); font-size: 11px;">${v.lead_days || 0}d</td>
      </tr>
    `;
    })
    .join("");
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

