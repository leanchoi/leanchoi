import React from "react";

export function TopoBackground() {
  const paths: string[] = [];
  for (let i = 0; i < 9; i++) {
    const a = 26 + i * 15;
    const b = 14 + i * 9;
    paths.push(
      `M-40 ${a} C 120 ${a - b}, 260 ${a + b}, 460 ${a - b / 2} S 760 ${a + b}, 1000 ${a - b / 3}`
    );
  }

  return (
    <svg
      className="topo-svg"
      viewBox="0 0 900 190"
      preserveAspectRatio="none"
      aria-hidden="true"
      style={{ color: "var(--rule)", opacity: 0.28 }}
    >
      {paths.map((d, idx) => (
        <path
          key={idx}
          d={d}
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
        />
      ))}
    </svg>
  );
}