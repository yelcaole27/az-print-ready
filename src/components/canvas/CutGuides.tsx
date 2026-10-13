import React from 'react';
import type { Page, Settings } from '@/types';
import { computeCutGuides } from '@/lib/cutGuides';
import { getPageDimensionsMm } from '@/lib/pageGeometry';

export interface CutGuidesProps {
  page: Page;
  settings: Settings;
  scale: number; // px per mm (e.g. 96 / 25.4 * zoom on screen, or 96 / 25.4 in print)
}

export function CutGuides({ page, settings, scale }: CutGuidesProps) {
  const { cutStyle } = settings;
  if (!cutStyle || cutStyle === 'none') return null;

  const { lines, boxes } = computeCutGuides(page, settings);
  if (lines.length === 0 && boxes.length === 0) return null;

  const { wMm, hMm } = getPageDimensionsMm(page);
  const widthPx = wMm * scale;
  const heightPx = hMm * scale;

  // Thickness: 0.1 mm in scale units, but at least 1px on screen
  const strokeWidth = Math.max(1, 0.1 * scale);

  return (
    <svg
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: `${widthPx}px`,
        height: `${heightPx}px`,
        pointerEvents: 'none',
        zIndex: 25,
      }}
      aria-hidden="true"
      className="pointer-events-none select-none"
    >
      {/* Ticks */}
      {lines.map((l, i) => (
        <line
          key={`cut-line-${i}`}
          x1={l.x1 * scale}
          y1={l.y1 * scale}
          x2={l.x2 * scale}
          y2={l.y2 * scale}
          stroke="#000000"
          strokeWidth={strokeWidth}
        />
      ))}

      {/* Outline boxes */}
      {boxes.map((b, i) => (
        <rect
          key={`cut-box-${i}`}
          x={b.x * scale}
          y={b.y * scale}
          width={b.w * scale}
          height={b.h * scale}
          fill="none"
          stroke="#000000"
          strokeWidth={strokeWidth}
        />
      ))}
    </svg>
  );
}
