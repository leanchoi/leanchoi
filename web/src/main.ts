import "leaflet/dist/leaflet.css";
import "./styles/main.css";
import { renderCatalog } from "./views/catalog.js";
import { renderViewer } from "./views/viewer.js";
import { renderAdmin } from "./views/admin.js";

type Cleanup = void | (() => void);
type Handler = (app: HTMLElement, params: Record<string, string>) => Cleanup;

interface Route {
  pattern: RegExp;
  keys: string[];
  handler: Handler;
}

function route(path: string, handler: Handler): Route {
  const keys: string[] = [];
  const pattern = new RegExp(
    "^" +
      path.replace(/:[^/]+/g, (m) => {
        keys.push(m.slice(1));
        return "([^/]+)";
      }) +
      "/?$",
  );
  return { pattern, keys, handler };
}

const routes: Route[] = [
  route("/", renderCatalog),
  route("/r/:slug", renderViewer),
  route("/admin", renderAdmin),
];

let currentCleanup: (() => void) | null = null;

function resolve(pathname: string): { handler: Handler; params: Record<string, string> } {
  for (const r of routes) {
    const m = r.pattern.exec(pathname);
    if (m) {
      const params: Record<string, string> = {};
      r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
      return { handler: r.handler, params };
    }
  }
  return { handler: renderCatalog, params: {} };
}

async function render(): Promise<void> {
  const app = document.getElementById("app");
  if (!app) return;
  if (currentCleanup) {
    currentCleanup();
    currentCleanup = null;
  }
  app.innerHTML = "";
  const { handler, params } = resolve(location.pathname);
  const cleanup = handler(app, params);
  if (typeof cleanup === "function") currentCleanup = cleanup;
}

/** SPA navigation helper used by links across the app. */
export function navigate(to: string): void {
  if (to === location.pathname) return;
  history.pushState({}, "", to);
  void render();
}

// Intercept internal link clicks for client-side routing.
document.addEventListener("click", (e) => {
  const target = (e.target as HTMLElement).closest("a[data-link]");
  if (!target) return;
  const href = target.getAttribute("href");
  if (!href || href.startsWith("http")) return;
  e.preventDefault();
  navigate(href);
});

window.addEventListener("popstate", () => void render());

void render();
