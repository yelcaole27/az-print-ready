import React from 'react';
import type { PageElement, ImageAsset } from '@/types';
import { MM_TO_PX } from '@/lib/pageGeometry';

export interface ElementContentProps {
  element: PageElement;
  asset?: ImageAsset | null;
  zoom?: number;
  srcOverride?: string;
  loading?: 'eager' | 'lazy';
  decoding?: 'sync' | 'async' | 'auto';
}

export function ElementContent({
  element,
  asset,
  zoom = 1,
  srcOverride,
  loading,
  decoding,
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

  const imgSrc = srcOverride || asset.previewUrl || asset.objectUrl;
  const crop = element.cropRect || element.crop;
  const rotation = element.rotation || 0;
  const objectFit: React.CSSProperties['objectFit'] =
    element.fit === 'stretch' ? 'fill' : element.fit === 'contain' ? 'contain' : 'cover';

  const renderImageContent = () => {
    if (crop && !srcOverride) {
      return (
        <div className="relative w-full h-full overflow-hidden pointer-events-none">
          <img
            src={imgSrc}
            alt=""
            draggable={false}
            loading={loading}
            decoding={decoding}
            style={{
              position: 'absolute',
              width: `${(1 / crop.w) * 100}%`,
              height: `${(1 / crop.h) * 100}%`,
              left: `${-(crop.x / crop.w) * 100}%`,
              top: `${-(crop.y / crop.h) * 100}%`,
              objectFit: element.fit === 'contain' ? 'contain' : 'fill',
              display: 'block',
            }}
            className="select-none pointer-events-none max-w-none max-h-none"
          />
        </div>
      );
    }

    return (
      <img
        src={imgSrc}
        alt=""
        draggable={false}
        loading={loading}
        decoding={decoding}
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
  };

  if (rotation === 90 || rotation === 270) {
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
          transform: `rotate(${rotation}deg)`,
          transformOrigin: 'center',
        }}
        className="absolute pointer-events-none"
      >
        {renderImageContent()}
      </div>
    );
  }

  if (rotation === 180) {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          transform: 'rotate(180deg)',
          transformOrigin: 'center',
        }}
        className="w-full h-full pointer-events-none"
      >
        {renderImageContent()}
      </div>
    );
  }

  return renderImageContent();
}
