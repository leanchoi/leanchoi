import { marked } from "marked";
import DOMPurify from "dompurify";
import type { Difficulty } from "./api.js";

export function fmtDistance(m: number): string {
  if (!m) return "—";
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`;
}

export function fmtElevation(m: number): string {
  return m ? `${m} m` : "—";
}

export function fmtDuration(min: number | null): string {
  if (!min) return "—";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h} h ${m} min`;
  if (h) return `${h} h`;
  return `${m} min`;
}

export const DIFFICULTY_META: Record<
  Difficulty,
  { label: string; color: string }
> = {
  facil: { label: "Fácil", color: "#16a34a" },
  moderada: { label: "Moderada", color: "#d97706" },
  dificil: { label: "Difícil", color: "#dc2626" },
};

export const ACTIVITY_LABELS: Record<string, string> = {
  senderismo: "Senderismo",
  bici: "Bici",
  auto: "Auto",
  cabalgata: "Cabalgata",
  mixto: "Mixto",
};

/** Render user markdown to sanitized HTML. Never inject raw HTML. */
export function renderMarkdown(md: string | null | undefined): string {
  if (!md) return "";
  const raw = marked.parse(md, { async: false }) as string;
  return DOMPurify.sanitize(raw, {
    ALLOWED_TAGS: [
      "a", "b", "blockquote", "br", "code", "em", "h1", "h2", "h3", "h4",
      "hr", "i", "li", "ol", "p", "pre", "strong", "ul", "img", "table",
      "thead", "tbody", "tr", "th", "td",
    ],
    ALLOWED_ATTR: ["href", "title", "target", "rel", "src", "alt"],
  });
}

/** Escape plain text for safe insertion into HTML. */
export function esc(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { className?: string } = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  Object.assign(node, props);
  for (const c of children) {
    node.append(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return node;
}
