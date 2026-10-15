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
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 h-11 px-2.5 bg-glass backdrop-blur-[14px] border border-line2 rounded-[18px] p-1.5 shadow-lg flex items-center gap-1.5 select-none z-30 text-xs font-medium text-text">
      {/* Zoom In/Out Stepper */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={handleStepDown}
          disabled={zoom <= 0.25}
          title="Zoom out"
          aria-label="Zoom out"
          className="w-8 h-8 flex items-center justify-center rounded-[12px] text-muted hover:text-text hover:bg-surface2 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>

        <span className="w-12 text-center text-xs font-bold font-mono tabular-nums text-text">
          {zoomPercent}%
        </span>

        <button
          type="button"
          onClick={handleStepUp}
          disabled={zoom >= 4}
          title="Zoom in"
          aria-label="Zoom in"
          className="w-8 h-8 flex items-center justify-center rounded-[12px] text-muted hover:text-text hover:bg-surface2 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="w-[1px] h-4 bg-line2 mx-1" />

      {/* Preset Modes */}
      <button
        type="button"
        onClick={() => {
          setZoomMode('fit-width');
          onFitWidth();
        }}
        className={`h-8 px-3 rounded-[12px] cursor-pointer transition-colors text-xs font-semibold ${
          zoomMode === 'fit-width'
            ? 'bg-blue-tint text-blue'
            : 'text-muted hover:text-text hover:bg-surface2'
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
        className={`h-8 px-3 rounded-[12px] cursor-pointer transition-colors text-xs font-semibold ${
          zoomMode === 'fit-page'
            ? 'bg-blue-tint text-blue'
            : 'text-muted hover:text-text hover:bg-surface2'
        }`}
      >
        Fit page
      </button>

      <button
        type="button"
        onClick={handle100Percent}
        className={`h-8 px-3 rounded-[12px] cursor-pointer transition-colors text-xs font-semibold ${
          zoomPercent === 100 && zoomMode === 'custom'
            ? 'bg-blue-tint text-blue'
            : 'text-muted hover:text-text hover:bg-surface2'
        }`}
      >
        100%
      </button>

      <div className="w-[1px] h-4 bg-line2 mx-1" />

      {/* Margins Toggle */}
      <button
        type="button"
        onClick={toggleMargins}
        className={`h-8 px-3 rounded-[12px] cursor-pointer transition-colors text-xs font-semibold ${
          showMargins
            ? 'bg-blue-tint text-blue'
            : 'text-muted hover:text-text hover:bg-surface2'
        }`}
      >
        Margins
      </button>
    </div>
  );
}
