// Self-contained interactive elevation profile (SVG). No external libraries,
// no CDN. Renders an area chart of elevation vs. distance and reports hover
// position back so the viewer can move a marker along the track — the
// toprutas/wikiloc behaviour.

export interface TrackPoint {
  lat: number;
  lng: number;
  ele: number;
  /** Cumulative distance from start, in metres. */
  dist: number;
}

export interface ElevationChart {
  /** Highlight the point nearest to a cumulative distance (metres). */
  highlightAt(dist: number | null): void;
  /** Re-render (e.g. on container resize). */
  redraw(): void;
  destroy(): void;
}

const SVG_NS = "http://www.w3.org/2000/svg";
const PAD = { top: 10, right: 10, bottom: 18, left: 42 };
const HEIGHT = 130;

function el(name: string, attrs: Record<string, string | number> = {}): SVGElement {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function niceTicks(min: number, max: number, count: number): number[] {
  const span = max - min || 1;
  const step0 = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const norm = step0 / mag;
  const step =
    (norm >= 5 ? 5 : norm >= 2 ? 2 : 1) * mag;
  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let t = start; t <= max; t += step) ticks.push(t);
  return ticks;
}

/**
 * @param container  host element (fixed height recommended)
 * @param points     track points with cumulative distance + elevation
 * @param onHover    called with the hovered point (or null on leave)
 */
export function createElevationChart(
  container: HTMLElement,
  points: TrackPoint[],
  onHover: (p: TrackPoint | null) => void,
): ElevationChart {
  container.classList.add("elev-chart");
  const totalDist = points.length ? points[points.length - 1].dist : 0;
  const eles = points.map((p) => p.ele);
  const eleMin = Math.min(...eles);
  const eleMax = Math.max(...eles);

  let svg: SVGSVGElement;
  let cursorLine: SVGElement;
  let cursorDot: SVGElement;
  let tooltip: HTMLElement;
  let width = 0;

  const xToDist = (px: number): number => {
    const innerW = width - PAD.left - PAD.right;
    const ratio = (px - PAD.left) / innerW;
    return Math.max(0, Math.min(1, ratio)) * totalDist;
  };
  const distToX = (d: number): number => {
    const innerW = width - PAD.left - PAD.right;
    return PAD.left + (totalDist ? d / totalDist : 0) * innerW;
  };
  const eleToY = (e: number): number => {
    const innerH = HEIGHT - PAD.top - PAD.bottom;
    const span = eleMax - eleMin || 1;
    return PAD.top + (1 - (e - eleMin) / span) * innerH;
  };

  // Binary search nearest point by cumulative distance.
  function nearest(dist: number): TrackPoint {
    let lo = 0;
    let hi = points.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (points[mid].dist < dist) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0 && Math.abs(points[lo - 1].dist - dist) < Math.abs(points[lo].dist - dist)) {
      return points[lo - 1];
    }
    return points[lo];
  }

  function build(): void {
    width = container.clientWidth || 600;
    container.innerHTML = "";

    svg = el("svg", {
      viewBox: `0 0 ${width} ${HEIGHT}`,
      width: "100%",
      height: HEIGHT,
      preserveAspectRatio: "none",
    }) as SVGSVGElement;

    // Y grid + labels (elevation).
    for (const t of niceTicks(eleMin, eleMax, 3)) {
      const y = eleToY(t);
      svg.append(
        el("line", {
          x1: PAD.left,
          x2: width - PAD.right,
          y1: y,
          y2: y,
          class: "elev-grid",
        }),
      );
      const label = el("text", { x: 4, y: y + 3, class: "elev-axis" });
      label.textContent = `${Math.round(t)}`;
      svg.append(label);
    }

    // X labels (km).
    for (const t of niceTicks(0, totalDist, 5)) {
      const x = distToX(t);
      const label = el("text", {
        x,
        y: HEIGHT - 5,
        class: "elev-axis",
        "text-anchor": "middle",
      });
      label.textContent =
        totalDist >= 2000 ? `${(t / 1000).toFixed(0)}` : `${Math.round(t)}`;
      svg.append(label);
    }

    // Area + line paths.
    let d = `M ${distToX(0)} ${eleToY(points[0].ele)}`;
    for (const p of points) d += ` L ${distToX(p.dist)} ${eleToY(p.ele)}`;
    const linePath = el("path", { d, class: "elev-line" });
    const baseY = HEIGHT - PAD.bottom;
    const areaPath = el("path", {
      d: `${d} L ${distToX(totalDist)} ${baseY} L ${distToX(0)} ${baseY} Z`,
      class: "elev-area",
    });
    svg.append(areaPath, linePath);

    // Cursor (hidden until hover).
    cursorLine = el("line", {
      y1: PAD.top,
      y2: baseY,
      class: "elev-cursor",
      style: "display:none",
    });
    cursorDot = el("circle", { r: 4.5, class: "elev-dot", style: "display:none" });
    svg.append(cursorLine, cursorDot);

    // Transparent capture rect for pointer events.
    const capture = el("rect", {
      x: 0,
      y: 0,
      width,
      height: HEIGHT,
      fill: "transparent",
      style: "cursor:crosshair",
    });
    svg.append(capture);

    tooltip = document.createElement("div");
    tooltip.className = "elev-tooltip";
    tooltip.style.display = "none";

    container.append(svg);
    container.append(tooltip);

    const onMove = (clientX: number): void => {
      const rect = svg.getBoundingClientRect();
      const px = ((clientX - rect.left) / rect.width) * width;
      const p = nearest(xToDist(px));
      highlight(p);
      onHover(p);
    };

    capture.addEventListener("mousemove", (e) => onMove((e as MouseEvent).clientX));
    capture.addEventListener("mouseleave", () => {
      highlight(null);
      onHover(null);
    });
    capture.addEventListener(
      "touchmove",
      (e) => {
        const t = (e as TouchEvent).touches[0];
        if (t) onMove(t.clientX);
        e.preventDefault();
      },
      { passive: false },
    );
    capture.addEventListener("touchend", () => {
      highlight(null);
      onHover(null);
    });
  }

  function highlight(p: TrackPoint | null): void {
    if (!p) {
      cursorLine.setAttribute("style", "display:none");
      cursorDot.setAttribute("style", "display:none");
      tooltip.style.display = "none";
      return;
    }
    const x = distToX(p.dist);
    const y = eleToY(p.ele);
    cursorLine.setAttribute("x1", String(x));
    cursorLine.setAttribute("x2", String(x));
    cursorLine.setAttribute("style", "");
    cursorDot.setAttribute("cx", String(x));
    cursorDot.setAttribute("cy", String(y));
    cursorDot.setAttribute("style", "");
    tooltip.style.display = "";
    tooltip.textContent = `${(p.dist / 1000).toFixed(2)} km · ${Math.round(p.ele)} m`;
    const leftPct = (x / width) * 100;
    tooltip.style.left = `${leftPct}%`;
  }

  build();

  return {
    highlightAt(dist) {
      if (dist == null) highlight(null);
      else highlight(nearest(dist));
    },
    redraw() {
      build();
    },
    destroy() {
      container.innerHTML = "";
      container.classList.remove("elev-chart");
    },
  };
}
