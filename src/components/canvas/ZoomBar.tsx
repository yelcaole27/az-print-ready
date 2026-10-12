'use client';

import React from 'react';
import { Minus, Plus } from 'lucide-react';
import { useUiStore } from '@/store/useUiStore';

export interface ZoomBarProps {
  onFitWidth: () => void;
  onFitPage: () => void;
}

export function ZoomBar({ onFitWidth, onFitPage }: ZoomBarProps) {
  const {
    zoom,
    zoomMode,
    showMargins,
    setZoom,
    setZoomMode,
    toggleMargins,
  } = useUiStore();

  const zoomPercent = Math.round(zoom * 100);

  const handleStepDown = () => {
    setZoom(zoom - 0.1);
  };

  const handleStepUp = () => {
    setZoom(zoom + 0.1);
  };

  const handle100Percent = () => {
    setZoom(1);
  };

  return (
    <div className="absolute bottom-5 left-1/2 -translate-x-1/2 h-10 px-3 bg-paper border border-line rounded-[12px] shadow-sm flex items-center gap-2 select-none z-30 text-xs font-medium text-ink">
      {/* Zoom In/Out Stepper */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={handleStepDown}
          disabled={zoom <= 0.25}
          title="Zoom out"
          aria-label="Zoom out"
          className="w-7 h-7 flex items-center justify-center rounded-[6px] text-muted hover:text-ink hover:bg-surface disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>

        <span className="w-12 text-center text-xs font-mono tabular-nums text-ink">
          {zoomPercent}%
        </span>

        <button
          type="button"
          onClick={handleStepUp}
          disabled={zoom >= 4}
          title="Zoom in"
          aria-label="Zoom in"
          className="w-7 h-7 flex items-center justify-center rounded-[6px] text-muted hover:text-ink hover:bg-surface disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="w-[1px] h-4 bg-line mx-1" />

      {/* Preset Modes */}
      <button
        type="button"
        onClick={() => {
          setZoomMode('fit-width');
          onFitWidth();
        }}
        className={`h-7 px-2.5 rounded-[6px] cursor-pointer transition-colors ${
          zoomMode === 'fit-width'
            ? 'bg-surface text-blue font-semibold'
            : 'text-muted hover:text-ink hover:bg-surface'
        }`}
      >
        Fit width
      </button>

      <button
        type="button"
        onClick={() => {
          setZoomMode('fit-page');
          onFitPage();
        }}
        className={`h-7 px-2.5 rounded-[6px] cursor-pointer transition-colors ${
          zoomMode === 'fit-page'
            ? 'bg-surface text-blue font-semibold'
            : 'text-muted hover:text-ink hover:bg-surface'
        }`}
      >
        Fit page
      </button>

      <button
        type="button"
        onClick={handle100Percent}
        className={`h-7 px-2.5 rounded-[6px] cursor-pointer transition-colors ${
          zoomPercent === 100 && zoomMode === 'custom'
            ? 'bg-surface text-blue font-semibold'
            : 'text-muted hover:text-ink hover:bg-surface'
        }`}
      >
        100%
      </button>

      <div className="w-[1px] h-4 bg-line mx-1" />

      {/* Margins Toggle */}
      <button
        type="button"
        onClick={toggleMargins}
        className={`h-7 px-2.5 rounded-[6px] cursor-pointer transition-colors ${
          showMargins
            ? 'bg-surface text-blue font-semibold'
            : 'text-muted hover:text-ink hover:bg-surface'
        }`}
      >
        Margins
      </button>
    </div>
  );
}
