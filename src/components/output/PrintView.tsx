import React from 'react';
import type { Job, ImageAsset } from '@/types';
import { ElementContent } from '@/components/canvas/ElementContent';
import { CutGuides } from '@/components/canvas/CutGuides';
import { getPageDimensionsMm, MM_TO_PX } from '@/lib/pageGeometry';

export interface PrintViewProps {
  job: Job;
  pageIndexes: number[]; // output pages (0-based)
  assetsById: Map<string, ImageAsset>;
  assetSrcOverrides?: Record<string, string>;
}

export function PrintView({ job, pageIndexes, assetsById, assetSrcOverrides }: PrintViewProps) {
  const { settings, pages } = job;

  return (
    <div id="print-root-container">
      {pageIndexes.map((pageIdx, idxInOutput) => {
        const page = pages[pageIdx];
        if (!page) return null;

        const { wMm, hMm } = getPageDimensionsMm(page);
        const isLastPage = idxInOutput === pageIndexes.length - 1;

        return (
          <div
            key={page.id}
            className="print-page"
            style={{
              width: `${wMm}mm`,
              height: `${hMm}mm`,
              position: 'relative',
              backgroundColor: '#FFFFFF',
              overflow: 'hidden',
              boxSizing: 'border-box',
              margin: 0,
              padding: 0,
              border: 'none',
              boxShadow: 'none',
              borderRadius: 0,
              pageBreakAfter: isLastPage ? 'avoid' : 'always',
              breakAfter: isLastPage ? 'avoid' : 'page',
            }}
          >
            {/* Cut Guides */}
            <CutGuides page={page} settings={settings} scale={MM_TO_PX} />

            {/* Elements */}
            {page.elements.map((el) => {
              const elLeftPx = el.xMm * MM_TO_PX;
              const elTopPx = el.yMm * MM_TO_PX;
              const elWPx = el.wMm * MM_TO_PX;
              const elHPx = el.hMm * MM_TO_PX;

              const asset = el.assetId ? assetsById.get(el.assetId) : null;
              const srcOverride =
                el.assetId && assetSrcOverrides ? assetSrcOverrides[el.assetId] : undefined;

              return (
                <div
                  key={el.id}
                  style={{
                    position: 'absolute',
                    left: `${elLeftPx}px`,
                    top: `${elTopPx}px`,
                    width: `${elWPx}px`,
                    height: `${elHPx}px`,
                    overflow: 'hidden',
                  }}
                >
                  <ElementContent
                    element={el}
                    asset={asset}
                    zoom={1}
                    srcOverride={srcOverride}
                    loading="eager"
                    decoding="sync"
                  />
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
