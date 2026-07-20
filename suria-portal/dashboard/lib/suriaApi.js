// SURIA — helper para hablar con dashboard_api.js (puerto 3103)
// Resuelve la URL base según desde dónde se sirve el dashboard:
//   · https://dashboard.colabtur.org  →  https://dashboard-api.colabtur.org
//   · cualquier otro host             →  http://<host>:3103
//   · override manual                 →  NEXT_PUBLIC_SURIA_API

const TOKEN = process.env.NEXT_PUBLIC_SURIA_API_TOKEN || '';

export function apiBase() {
  if (process.env.NEXT_PUBLIC_SURIA_API) return process.env.NEXT_PUBLIC_SURIA_API;
  if (typeof window !== 'undefined') {
    const { hostname, protocol } = window.location;
    if (hostname.endsWith('colabtur.org')) return 'https://dashboard-api.colabtur.org';
    return `${protocol}//${hostname}:3103`;
  }
  return 'http://127.0.0.1:3103';
}

function headers() {
  const h = { 'Content-Type': 'application/json' };
  if (TOKEN) h.Authorization = `Bearer ${TOKEN}`;
  return h;
}

async function parse(res) {
  let data = null;
  try { data = await res.json(); } catch (_) { /* cuerpo vacío */ }
  if (!res.ok) {
    throw new Error((data && data.error) || `HTTP ${res.status}`);
  }
  return data;
}

export async function apiGet(path) {
  const res = await fetch(`${apiBase()}${path}`, { headers: headers() });
  return parse(res);
}

export async function apiPost(path, body) {
  const res = await fetch(`${apiBase()}${path}`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body || {}),
  });
  return parse(res);
}
