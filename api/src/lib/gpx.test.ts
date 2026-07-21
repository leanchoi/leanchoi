import { describe, it, expect } from "vitest";
import { parseGpxStats } from "./gpx.js";

// A tiny 3-point track along the equator/meridian with a known elevation
// profile, so distance, ascent/descent and bbox are all predictable.
const SAMPLE_GPX = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><trkseg>
    <trkpt lat="0.0000" lon="0.0000"><ele>100</ele></trkpt>
    <trkpt lat="0.0000" lon="0.0100"><ele>150</ele></trkpt>
    <trkpt lat="0.0100" lon="0.0100"><ele>120</ele></trkpt>
  </trkseg></trk>
</gpx>`;

describe("parseGpxStats", () => {
  const stats = parseGpxStats(SAMPLE_GPX);

  it("computes distance (~2.2 km for two ~1.11 km legs)", () => {
    // 0.01° ≈ 1.11 km at the equator; two legs ≈ 2.22 km.
    expect(stats.distanceM).toBeGreaterThan(2100);
    expect(stats.distanceM).toBeLessThan(2300);
  });

  it("computes ascent and descent above the 3 m threshold", () => {
    // +50 m then -30 m.
    expect(stats.ascentM).toBe(50);
    expect(stats.descentM).toBe(30);
  });

  it("computes the bounding box", () => {
    expect(stats.minLat).toBeCloseTo(0, 5);
    expect(stats.minLng).toBeCloseTo(0, 5);
    expect(stats.maxLat).toBeCloseTo(0.01, 5);
    expect(stats.maxLng).toBeCloseTo(0.01, 5);
  });

  it("computes a center inside the bbox", () => {
    expect(stats.centerLat).toBeGreaterThanOrEqual(stats.minLat);
    expect(stats.centerLat).toBeLessThanOrEqual(stats.maxLat);
    expect(stats.centerLng).toBeGreaterThanOrEqual(stats.minLng);
    expect(stats.centerLng).toBeLessThanOrEqual(stats.maxLng);
  });

  it("ignores sub-threshold elevation noise", () => {
    const noisy = SAMPLE_GPX.replace("<ele>150</ele>", "<ele>102</ele>");
    const s = parseGpxStats(noisy);
    // 100 -> 102 (+2, ignored) -> 120 (+18). Net ascent should be 20, no descent.
    expect(s.ascentM).toBe(20);
    expect(s.descentM).toBe(0);
  });
});
