import React from 'react';
import type { PageElement, ImageAsset } from '@/types';
import { MM_TO_PX } from '@/lib/pageGeometry';

export interface ElementContentProps {
  element: PageElement;
  asset?: ImageAsset | null;
  zoom?: number;
}

export function ElementContent({
  element,
  asset,
  zoom = 1,
}: ElementContentProps) {
  if (element.type === 'text') {
    const vAlign = element.vAlign || 'top';
    let justifyContent = 'flex-start';
    if (vAlign === 'middle') justifyContent = 'center';
    if (vAlign === 'bottom') justifyContent = 'flex-end';

    const paddingPx = (element.paddingMm ?? 2) * MM_TO_PX;
    const borderMm = element.borderMm ?? 0;
    const borderPx = borderMm * MM_TO_PX;
    const borderColor = element.borderColor || '#111111';
    const fillColor = element.fillColor || 'transparent';

    const baseWPx = element.wMm * MM_TO_PX;
    const baseHPx = element.hMm * MM_TO_PX;

    const isEmptyText =
      !element.html || element.html === '<p></p>' || element.html.trim() === '';

    return (
      <div
        style={{
          width: `${baseWPx}px`,
          height: `${baseHPx}px`,
          transform: `scale(${zoom})`,
          transformOrigin: 'top left',
          backgroundColor: fillColor,
          borderWidth: `${borderPx}px`,
          borderStyle: borderPx > 0 ? 'solid' : 'none',
          borderColor: borderColor,
          padding: `${paddingPx}px`,
          display: 'flex',
          flexDirection: 'column',
          justifyContent,
          boxSizing: 'border-box',
        }}
        className="sheet-text-container select-none pointer-events-none"
      >
        {isEmptyText ? (
          <span className="text-sheet-muted italic no-print text-[14pt]">
            Double-click to type
          </span>
        ) : (
          <div
            dangerouslySetInnerHTML={{ __html: element.html || '' }}
            className="w-full"
          />
        )}
      </div>
    );
  }

  // Image Element
  if (!asset) {
    return (
      <div className="w-full h-full bg-sheet-blue/5 flex items-center justify-center text-sheet-muted text-xs">
        Missing asset
      </div>
    );
  }

  if (element.crop) {
    return (
      <div className="relative w-full h-full overflow-hidden pointer-events-none">
        <img
          src={asset.objectUrl}
          alt=""
          draggable={false}
          style={{
            position: 'absolute',
            width: `${(1 / element.crop.w) * 100}%`,
            height: `${(1 / element.crop.h) * 100}%`,
            left: `${-(element.crop.x / element.crop.w) * 100}%`,
            top: `${-(element.crop.y / element.crop.h) * 100}%`,
            objectFit: 'fill',
            display: 'block',
          }}
          className="select-none pointer-events-none max-w-none max-h-none"
        />
      </div>
    );
  }

  const rotation = element.rotation || 0;
  const fit = element.fit || 'cover';
  const objectFit: React.CSSProperties['objectFit'] =
    fit === 'stretch' ? 'fill' : fit;

  if (rotation === 90) {
    const widthPx = element.wMm * MM_TO_PX * zoom;
    const heightPx = element.hMm * MM_TO_PX * zoom;
    const innerW = heightPx;
    const innerH = widthPx;
    const innerLeft = (widthPx - innerW) / 2;
    const innerTop = (heightPx - innerH) / 2;

    return (
      <div
        style={{
          width: `${innerW}px`,
          height: `${innerH}px`,
          left: `${innerLeft}px`,
          top: `${innerTop}px`,
          transform: 'rotate(90deg)',
          transformOrigin: 'center',
        }}
        className="absolute pointer-events-none"
      >
        <img
          src={asset.objectUrl}
          alt=""
          draggable={false}
          style={{
            width: '100%',
            height: '100%',
            objectFit,
            objectPosition: 'center',
            display: 'block',
          }}
          className="select-none pointer-events-none"
        />
      </div>
    );
  }

  return (
    <img
      src={asset.objectUrl}
      alt=""
      draggable={false}
      style={{
        width: '100%',
        height: '100%',
        objectFit,
        objectPosition: 'center',
        display: 'block',
      }}
      className="select-none pointer-events-none"
    />
  );
}
