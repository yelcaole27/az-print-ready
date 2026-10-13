'use client';

import React, { useMemo, useEffect } from 'react';
import { useSessionStore } from '@/store/useSessionStore';
import { useUiStore } from '@/store/useUiStore';
import { ModalShell } from './ModalShell';
import { getPageDimensionsMm } from '@/lib/pageGeometry';
import { collageOptions, CollageItem } from '@/lib/collageLayout';
import { finishMultiImport } from '@/lib/multiImportActions';

export function LayoutModal() {
  const multiImport = useUiStore((s) => s.multiImport);
  const setMultiImport = useUiStore((s) => s.setMultiImport);
  const discardAssets = useSessionStore((s) => s.discardAssets);
  const assets = useSessionStore((s) => s.assets);
  const jobs = useSessionStore((s) => s.jobs);
  const activeJobId = useSessionStore((s) => s.activeJobId);

  const assetMap = useMemo(() => {
    return new Map(assets.map((a) => [a.id, a]));
  }, [assets]);

  const activeJob = useMemo(() => {
    return jobs.find((j) => j.id === activeJobId) || jobs[0];
  }, [jobs, activeJobId]);

  const pagesNeedingLayout = useMemo(() => {
    if (!multiImport) return [];
    return multiImport.cards.filter((c) => c.assetIds.length >= 2);
  }, [multiImport]);

  const totalSteps = pagesNeedingLayout.length;
  const currentStep = multiImport?.layoutStepIndex ?? 0;
  const currentCard = pagesNeedingLayout[currentStep];

  // Paper geometry
  const templatePage = activeJob?.pages[0];
  const { wMm: pageWMm, hMm: pageHMm } = templatePage
    ? getPageDimensionsMm(templatePage)
    : { wMm: 215.9, hMm: 279.4 };
  const marginMm = activeJob?.settings.marginMm ?? 6.35;
  const gapMm = activeJob?.settings.gapMm ?? 2;

  // Options for the current card
  const options = useMemo(() => {
    if (!currentCard) return [];
    const items: CollageItem[] = [];
    for (const id of currentCard.assetIds) {
      const a = assetMap.get(id);
      if (a) {
        items.push({ assetId: a.id, pxW: a.pxW, pxH: a.pxH });
      }
    }
    return collageOptions(items, pageWMm, pageHMm, marginMm, gapMm);
  }, [currentCard, assetMap, pageWMm, pageHMm, marginMm, gapMm]);

  const chosenOptionId =
    currentCard && multiImport
      ? multiImport.chosenLayouts[currentCard.id] || 'best'
      : 'best';

  const handleCancel = React.useCallback(() => {
    if (!multiImport) return;
    discardAssets(multiImport.batchAssetIds);
    setMultiImport(null);
  }, [discardAssets, multiImport, setMultiImport]);

  const handleBack = React.useCallback(() => {
    if (currentStep > 0) {
      setMultiImport((prev) =>
        prev ? { ...prev, layoutStepIndex: currentStep - 1 } : null
      );
    } else {
      setMultiImport((prev) => (prev ? { ...prev, step: 'arrange' } : null));
    }
  }, [currentStep, setMultiImport]);

  const handleNextOrDone = React.useCallback(() => {
    if (!multiImport) return;
    if (currentStep < totalSteps - 1) {
      setMultiImport((prev) =>
        prev ? { ...prev, layoutStepIndex: currentStep + 1 } : null
      );
    } else {
      finishMultiImport(
        multiImport.cards,
        multiImport.chosenLayouts,
        multiImport.batchAssetIds
      );
    }
  }, [currentStep, totalSteps, multiImport, setMultiImport]);

  // Arrow keys and Enter navigation
  useEffect(() => {
    if (!multiImport || multiImport.step !== 'layout' || options.length === 0) {
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        const currentIdx = options.findIndex((o) => o.id === chosenOptionId);
        const nextIdx = (currentIdx + 1) % options.length;
        const nextOption = options[nextIdx];
        if (currentCard && nextOption) {
          setMultiImport((prev) =>
            prev
              ? {
                  ...prev,
                  chosenLayouts: {
                    ...prev.chosenLayouts,
                    [currentCard.id]: nextOption.id,
                  },
                }
              : null
          );
        }
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        const currentIdx = options.findIndex((o) => o.id === chosenOptionId);
        const prevIdx = (currentIdx - 1 + options.length) % options.length;
        const prevOption = options[prevIdx];
        if (currentCard && prevOption) {
          setMultiImport((prev) =>
            prev
              ? {
                  ...prev,
                  chosenLayouts: {
                    ...prev.chosenLayouts,
                    [currentCard.id]: prevOption.id,
                  },
                }
              : null
          );
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleNextOrDone();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    multiImport,
    options,
    chosenOptionId,
    currentCard,
    handleNextOrDone,
    setMultiImport,
  ]);

  if (!multiImport || multiImport.step !== 'layout' || !currentCard) {
    return null;
  }

  const { cards } = multiImport;

  // Find 1-based page number in original cards
  const originalPageNumber =
    cards.findIndex((c) => c.id === currentCard.id) + 1;

  const handleSelectOption = (optId: 'best' | 'grid' | 'column' | 'row') => {
    setMultiImport((prev) =>
      prev
        ? {
            ...prev,
            chosenLayouts: {
              ...prev.chosenLayouts,
              [currentCard.id]: optId,
            },
          }
        : null
    );
  };

  // Mini preview dimensions: 200px wide
  const previewW = 200;
  const previewH = Math.round(previewW * (pageHMm / pageWMm));
  const scale = previewW / pageWMm;

  return (
    <ModalShell titleId="layout-modal-title" onCancel={handleCancel}>
      {/* Header */}
      <div className="mb-6">
        <h2
          id="layout-modal-title"
          className="text-[20px] font-semibold text-ink leading-tight"
        >
          Choose a layout
        </h2>
        {totalSteps > 1 && (
          <p className="text-[14px] text-muted mt-1">
            Page {originalPageNumber} · {currentStep + 1} of {totalSteps}
          </p>
        )}
      </div>

      {/* Body: Grid of option cards (up to 4, 2 per row) */}
      <div className="flex-1 overflow-y-auto py-2 flex items-center justify-center min-h-[300px]">
        <div className="grid grid-cols-2 gap-6 max-w-[500px]">
          {options.map((option) => {
            const isSelected = option.id === chosenOptionId;

            return (
              <div
                key={option.id}
                role="button"
                tabIndex={0}
                onClick={() => handleSelectOption(option.id)}
                className={`p-3 rounded-[12px] bg-surface flex flex-col items-center cursor-pointer transition-all relative ${
                  isSelected
                    ? 'border-2 border-blue shadow-sm'
                    : 'border border-line hover:border-blue'
                }`}
              >
                {/* Check badge when selected */}
                {isSelected && (
                  <div
                    aria-label="Selected"
                    className="absolute top-2 right-2 w-5 h-5 rounded-full bg-blue text-white flex items-center justify-center text-xs"
                  >
                    <svg
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className="w-3.5 h-3.5"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                )}

                {/* Mini paper preview */}
                <div
                  style={{ width: `${previewW}px`, height: `${previewH}px` }}
                  className="relative bg-white border border-line rounded-[2px] shadow-xs overflow-hidden"
                >
                  {option.items.map((placed, pIdx) => {
                    const asset = assetMap.get(placed.assetId);
                    if (!asset) return null;

                    return (
                      <div
                        key={placed.assetId + pIdx}
                        style={{
                          position: 'absolute',
                          left: `${placed.xMm * scale}px`,
                          top: `${placed.yMm * scale}px`,
                          width: `${placed.wMm * scale}px`,
                          height: `${placed.hMm * scale}px`,
                        }}
                      >
                        <img
                          src={asset.objectUrl}
                          alt=""
                          draggable={false}
                          style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'fill',
                          }}
                          className="block select-none pointer-events-none"
                        />
                      </div>
                    );
                  })}
                </div>

                {/* Option label */}
                <span className="text-[14px] font-medium text-ink mt-2.5 select-none">
                  {option.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <div className="mt-6 pt-4 border-t border-line flex items-center justify-between">
        <button
          type="button"
          onClick={handleBack}
          className="h-[40px] px-5 rounded-[8px] border border-line bg-paper text-ink hover:border-blue hover:text-blue transition-colors text-[14px] font-medium cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
        >
          Back
        </button>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleCancel}
            className="h-[40px] px-5 rounded-[8px] border border-line bg-paper text-ink hover:border-blue hover:text-blue transition-colors text-[14px] font-medium cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleNextOrDone}
            className="h-[40px] px-6 rounded-[8px] bg-blue-strong text-white hover:bg-blue-strong/90 transition-colors text-[14px] font-medium cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
          >
            {currentStep < totalSteps - 1 ? 'Next' : 'Done'}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
