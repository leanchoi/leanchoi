# SURIA · Centro de Operaciones Global + Cerebro RAG

Portal unificado glassmórfico para el VPS `187.77.224.159`:

- **Pestaña “Aplicaciones”** — diales de RAM / disco / CPU del host, contadores de uso de
  Gemini (memorias, minutas, alertas, sesiones del minutero, tokens estimados) y un mapa
  de tarjetas con estado en vivo de las 10 aplicaciones (SURIA co-pilot, Minutero, NocoDB
  Trochi y Observatorio, Métrica, Andar, Bofi, Rojas, basesur y n8n).
- **Pestaña “Cerebro RAG”** — grafo 2D force-directed estilo Obsidian de `memory_vectors`
  (SQLite `/opt/suria/suria.db`), con nodos coloreados por `kind`, enlaces por temas
  compartidos, similitud coseno (slider dinámico) y clusters padre-hijo, búsqueda con
  resaltado en vivo, filtros por tipo/fuente/fecha y panel lateral con **editor inline**
  que al guardar **regenera el embedding Gemini** (y botón de borrado).

Sin dependencias nuevas: el grafo corre sobre HTML5 Canvas propio y el API usa solo
módulos nativos de Node (+ el driver SQLite que ya exista).

```
suria-portal/
├── api/
│   └── dashboard_api.js          → /opt/suria/dashboard_api.js   (puerto 3103)
└── dashboard/
    ├── lib/suriaApi.js           → /opt/suria-dashboard/lib/suriaApi.js
    ├── components/ControlCenter.js → /opt/suria-dashboard/components/ControlCenter.js
    ├── components/RagGraph.js    → /opt/suria-dashboard/components/RagGraph.js
    └── pages/dashboard.js        → /opt/suria-dashboard/pages/dashboard.js
```

---

## 1. Desplegar el API (puerto 3103)

```bash
# backup del actual
cp /opt/suria/dashboard_api.js /opt/suria/dashboard_api.js.bak

cp api/dashboard_api.js /opt/suria/dashboard_api.js
systemctl restart suria-dashboard-api
curl -s http://127.0.0.1:3103/api/health
```

> **¿Tu `dashboard_api.js` actual tiene endpoints propios que el dashboard usa?**
> No lo pises: copiá el archivo nuevo como `/opt/suria/portal_api.js` y montalo dentro
> del server existente — devuelve `false` si la ruta no es suya:
>
> ```js
> const portal = require('./portal_api.js');
> // dentro de tu http.createServer(async (req, res) => { ... })
> if (await portal.handlePortalRequest(req, res)) return;
> ```

### Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/health` | ping + driver SQLite detectado |
| GET | `/api/memories` | filas de `memory_vectors` sin el BLOB |
| GET | `/api/memories/embeddings` | vectores crudos `[{memory_id, vector}]` |
| GET | `/api/memories/embeddings?links=1&threshold=0.25&topk=20` | enlaces coseno precalculados `[{a,b,sim}]` (con caché; el slider filtra en el cliente sin recalcular) |
| POST | `/api/memories/update` | `{memory_id, content, topics}` → re-embebe con Gemini y **recién entonces** actualiza la fila (si Gemini falla, no se toca nada) |
| POST | `/api/memories/delete` | `{memory_id}` → borra la fila |
| GET | `/api/system/stats` | `free -b` + `df -kP /` + loadavg, chequeo TCP de los 14 puertos locales, contadores Gemini y links armados (minutero con token) |

### Variables de entorno (todas opcionales)

| Variable | Default | Uso |
|---|---|---|
| `PORT` / `HOST` | `3103` / `127.0.0.1` | Traefik ya proxya `dashboard-api.colabtur.org → 127.0.0.1:3103` |
| `SURIA_DB` | `/opt/suria/suria.db` | ruta de la base |
| `GEMINI_API_KEY` | — | necesaria solo para **guardar** ediciones (re-embedding). También se lee de `/opt/suria/.env` |
| `GEMINI_EMBED_MODEL` | `gemini-embedding-001` | 768 dims |
| `DASHBOARD_API_TOKEN` | — | si se define, exige `Authorization: Bearer …` (poné el mismo en `NEXT_PUBLIC_SURIA_API_TOKEN` al buildear el dashboard) |
| `MINUTER_TOKEN` / `MINUTER_URL` | — | arma el link de la tarjeta del Minutero con token |
| `SURIA_WHATSAPP_LINK` | — | link de la tarjeta del co-pilot (ej: `https://wa.me/549XXXXXXXXXX`) |

---

## 2. Desplegar el dashboard (Next.js)

```bash
cd /opt/suria-dashboard
cp pages/dashboard.js pages/dashboard.js.bak   # backup

mkdir -p components lib
cp <repo>/suria-portal/dashboard/lib/suriaApi.js           lib/
cp <repo>/suria-portal/dashboard/components/ControlCenter.js components/
cp <repo>/suria-portal/dashboard/components/RagGraph.js      components/
cp <repo>/suria-portal/dashboard/pages/dashboard.js          pages/

npm run build && systemctl restart suria-dashboard
```

- El gate de contraseña queda igual (`suria123`, override con `NEXT_PUBLIC_DASHBOARD_PASS`).
- El frontend resuelve el API solo: en `dashboard.colabtur.org` usa
  `https://dashboard-api.colabtur.org`; en cualquier otro host usa `http://<host>:3103`
  (override con `NEXT_PUBLIC_SURIA_API`).

**Si tu `pages/dashboard.js` actual ya tiene otras pestañas** y no querés reemplazarlo:
copiá solo `lib/` y `components/`, y en tu archivo agregá

```js
import ControlCenter from '../components/ControlCenter';
import RagGraph from '../components/RagGraph';
// dos entradas más en tu tab bar → renderizar <ControlCenter /> y <RagGraph />
```

Los componentes usan la clase global `.glass` y las variables `--text` / `--muted`
(definidas en el `<style jsx global>` del `dashboard.js` incluido — copialas si integrás a mano).

---

## 3. Notas de diseño

- **Colores de nodos** (por `kind`): nota `#8b5cf6` · minuta `#059669` · alerta `#ea580c` ·
  evento `#0284c7`. Paleta validada para fondo oscuro y visión de color (CVD ΔE ≥ 10),
  siempre acompañada de etiquetas de texto (chips-leyenda con conteos en el rail).
- **Enlaces**: violeta = semánticos (opacidad ∝ similitud), cian = temas compartidos,
  gris = padre-hijo. El slider filtra los enlaces precalculados (umbral base 0.25) sin
  pedir los vectores de 3 KB por nodo.
- **Física**: resortes + repulsión con grilla espacial + gravedad, `requestAnimationFrame`
  con auto-descanso (“✓ estable”) para no gastar CPU; arrastre de nodos, pan, zoom con
  rueda y pinch en el celular.
- Estados vacíos y de error con mensajes claros (sin placeholders rotos).

## 4. Prueba rápida sin tocar producción

```bash
SURIA_DB=/ruta/a/una/copia.db PORT=3903 node api/dashboard_api.js
curl -s localhost:3903/api/system/stats | python3 -m json.tool | head
```
