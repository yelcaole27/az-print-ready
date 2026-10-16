'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { nanoid } from 'nanoid';
import { Check, ArrowRight, Plus } from 'lucide-react';
import { useSessionStore } from '@/store/useSessionStore';
import { useUiStore, MultiImportCard } from '@/store/useUiStore';
import { ModalShell } from './ModalShell';
import { finishMultiImport } from '@/lib/multiImportActions';

export function ArrangeModal() {
  const multiImport = useUiStore((s) => s.multiImport);
  const setMultiImport = useUiStore((s) => s.setMultiImport);
  const discardAssets = useSessionStore((s) => s.discardAssets);
  const assets = useSessionStore((s) => s.assets);
  const jobs = useSessionStore((s) => s.jobs);
  const activeJobId = useSessionStore((s) => s.activeJobId);

  const [activeMenuAssetId, setActiveMenuAssetId] = useState<string | null>(null);
  const [dragOverCardId, setDragOverCardId] = useState<string | null>(null);
  const [limitNotice, setLimitNotice] = useState<string | null>(null);

  const menuRef = useRef<HTMLDivElement>(null);

  const activeJob = useMemo(() => {
    return jobs.find((j) => j.id === activeJobId) || jobs[0];
  }, [jobs, activeJobId]);

  const templatePage = activeJob?.pages[0];
  const paperName = templatePage?.paperId
    ? templatePage.paperId.charAt(0).toUpperCase() + templatePage.paperId.slice(1)
    : 'Letter';

  const assetMap = useMemo(() => {
    return new Map(assets.map((a) => [a.id, a]));
  }, [assets]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setActiveMenuAssetId(null);
      }
    };
    if (activeMenuAssetId) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [activeMenuAssetId]);

  if (!multiImport || multiImport.step !== 'arrange') {
    return null;
  }

  const { cards, batchAssetIds, chosenLayouts } = multiImport;

  const isEachOnOwnPage =
    cards.length === batchAssetIds.length &&
    cards.every((c) => c.assetIds.length === 1);
  const isAllOnOnePage =
    cards.length === Math.ceil(batchAssetIds.length / 12) &&
    cards[0]?.assetIds.length > 1;

  const handleCancel = () => {
    if (!multiImport.isReAdd) {
      discardAssets(batchAssetIds);
    }
    setMultiImport(null);
  };

  const handleAllOnOnePage = () => {
    setLimitNotice(null);
    const newCards: MultiImportCard[] = [];
    for (let i = 0; i < batchAssetIds.length; i += 12) {
      newCards.push({
        id: nanoid(),
        assetIds: batchAssetIds.slice(i, i + 12),
      });
    }
    setMultiImport((prev) => (prev ? { ...prev, cards: newCards } : null));
  };

  const handleEachOnOwnPage = () => {
    setLimitNotice(null);
    const newCards: MultiImportCard[] = batchAssetIds.map((id) => ({
      id: nanoid(),
      assetIds: [id],
    }));
    setMultiImport((prev) => (prev ? { ...prev, cards: newCards } : null));
  };

  const movePicture = (
    assetId: string,
    fromCardId: string,
    targetCardIdOrNew: string
  ) => {
    setActiveMenuAssetId(null);

    if (targetCardIdOrNew === fromCardId) return;

    if (targetCardIdOrNew === 'new') {
      setLimitNotice(null);
      const updatedCards: MultiImportCard[] = [];
      for (const card of cards) {
        if (card.id === fromCardId) {
          const remaining = card.assetIds.filter((id) => id !== assetId);
          if (remaining.length > 0) {
            updatedCards.push({ ...card, assetIds: remaining });
          }
        } else {
          updatedCards.push(card);
        }
      }
      updatedCards.push({
        id: nanoid(),
        assetIds: [assetId],
      });

      setMultiImport((prev) =>
        prev ? { ...prev, cards: updatedCards } : null
      );
      return;
    }

    const targetCard = cards.find((c) => c.id === targetCardIdOrNew);
    if (!targetCard) return;

    if (targetCard.assetIds.length >= 12) {
      setLimitNotice('A page can hold at most 12 pictures.');
      return;
    }

    setLimitNotice(null);

    const updatedCards: MultiImportCard[] = [];
    for (const card of cards) {
      if (card.id === fromCardId) {
        const remaining = card.assetIds.filter((id) => id !== assetId);
        if (remaining.length > 0) {
          updatedCards.push({ ...card, assetIds: remaining });
        }
      } else if (card.id === targetCardIdOrNew) {
        updatedCards.push({
          ...card,
          assetIds: [...card.assetIds, assetId],
        });
      } else {
        updatedCards.push(card);
      }
    }

    setMultiImport((prev) =>
      prev ? { ...prev, cards: updatedCards } : null
    );
  };

  const handleAddNewPage = () => {
    setLimitNotice(null);
    setMultiImport((prev) =>
      prev
        ? {
            ...prev,
            cards: [...prev.cards, { id: nanoid(), assetIds: [] }],
          }
        : null
    );
  };

  const handleContinue = () => {
    const pagesWithMultiple = cards.filter((c) => c.assetIds.length >= 2);

    if (pagesWithMultiple.length === 0) {
      finishMultiImport(cards, chosenLayouts, batchAssetIds);
    } else {
      setMultiImport((prev) =>
        prev
          ? {
              ...prev,
              step: 'layout',
              layoutStepIndex: 0,
            }
          : null
      );
    }
  };

  return (
    <ModalShell titleId="arrange-modal-title" onCancel={handleCancel}>
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-5 shrink-0">
        <div>
          <h2
            id="arrange-modal-title"
            className="font-heading font-extrabold text-[34px] tracking-[-0.02em] leading-tight text-ink"
          >
            Arrange your{' '}
            <span className="font-accent italic text-[40px] text-red font-normal">
              pictures
            </span>
          </h2>
          <p className="text-[15px] text-muted mt-1">
            {batchAssetIds.length} pictures · {paperName}
          </p>
        </div>
      </div>

      {/* Two choices as big selectable cards */}
      <div className="grid grid-cols-2 gap-4 mb-4 shrink-0">
        {/* Choice A: Each on its own page */}
        <div
          role="button"
          tabIndex={0}
          onClick={handleEachOnOwnPage}
          className={`rounded-[22px] p-4 pb-[18px] border-2 bg-surface2 flex flex-col cursor-pointer transition-all relative select-none ${
            isEachOnOwnPage
              ? 'border-blue bg-blue-tint'
              : 'border-line hover:border-line2'
          }`}
        >
          {isEachOnOwnPage && (
            <div
              aria-label="Selected"
              className="absolute top-3 right-3 w-[26px] h-[26px] rounded-full bg-blue text-white flex items-center justify-center shadow-xs"
            >
              <Check className="w-4 h-4 stroke-[2.5]" />
            </div>
          )}
          <span className="font-heading font-extrabold text-[18px] text-ink">
            Each on its own page
          </span>
          <span className="text-[13px] text-muted mt-0.5">
            One picture per sheet
          </span>
        </div>

        {/* Choice B: All on 1 page */}
        <div
          role="button"
          tabIndex={0}
          onClick={handleAllOnOnePage}
          className={`rounded-[22px] p-4 pb-[18px] border-2 bg-surface2 flex flex-col cursor-pointer transition-all relative select-none ${
            isAllOnOnePage
              ? 'border-blue bg-blue-tint'
              : 'border-line hover:border-line2'
          }`}
        >
          {isAllOnOnePage && (
            <div
              aria-label="Selected"
              className="absolute top-3 right-3 w-[26px] h-[26px] rounded-full bg-blue text-white flex items-center justify-center shadow-xs"
            >
              <Check className="w-4 h-4 stroke-[2.5]" />
            </div>
          )}
          <span className="font-heading font-extrabold text-[18px] text-ink">
            All on 1 page
          </span>
          <span className="text-[13px] text-muted mt-0.5">
            Put pictures together on a sheet
          </span>
        </div>
      </div>

      {limitNotice && (
        <p className="text-[14px] text-yellow font-medium mb-3 shrink-0">
          {limitNotice}
        </p>
      )}

      {/* Body: Horizontal Scrollable Row of Page Cards */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden py-2 flex gap-4 items-start min-h-[220px]">
        {cards.map((card, pageIndex) => {
          const isDragTarget = dragOverCardId === card.id;

          return (
            <div
              key={card.id}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
              }}
              onDragEnter={(e) => {
                e.preventDefault();
                setDragOverCardId(card.id);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                if (dragOverCardId === card.id) {
                  setDragOverCardId(null);
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverCardId(null);
                try {
                  const data = JSON.parse(
                    e.dataTransfer.getData('text/plain')
                  );
                  if (data?.assetId && data?.fromCardId) {
                    movePicture(data.assetId, data.fromCardId, card.id);
                  }
                } catch {
                  // Ignore invalid drag data
                }
              }}
              className={`w-[240px] min-w-[240px] bg-surface2 rounded-[16px] border-[1.5px] p-3 flex flex-col gap-2 transition-all shrink-0 ${
                isDragTarget
                  ? 'border-2 border-dashed border-blue bg-blue-tint'
                  : 'border-line'
              }`}
            >
              <div className="flex items-center justify-between select-none">
                <span className="text-sm font-bold text-ink">
                  Page {pageIndex + 1}
                </span>
                <span className="text-xs text-muted">
                  {card.assetIds.length}{' '}
                  {card.assetIds.length === 1 ? 'picture' : 'pictures'}
                </span>
              </div>

              <div className="bg-surface border border-line rounded-[12px] p-2 min-h-[140px] flex flex-wrap gap-2 content-start">
                {card.assetIds.map((assetId) => {
                  const asset = assetMap.get(assetId);
                  if (!asset) return null;
                  const isMenuOpen = activeMenuAssetId === assetId;

                  return (
                    <div
                      key={assetId}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData(
                          'text/plain',
                          JSON.stringify({
                            assetId,
                            fromCardId: card.id,
                          })
                        );
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      onClick={() => {
                        setActiveMenuAssetId(isMenuOpen ? null : assetId);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setActiveMenuAssetId(isMenuOpen ? null : assetId);
                        }
                      }}
                      tabIndex={0}
                      role="button"
                      aria-haspopup="menu"
                      aria-expanded={isMenuOpen}
                      aria-label={`Picture: ${asset.name}. Press Enter to move.`}
                      className="w-[62px] h-[62px] rounded-[14px] border border-line hover:border-blue overflow-hidden relative cursor-grab active:cursor-grabbing transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
                    >
                      <img
                        src={asset.thumbUrl || asset.objectUrl}
                        alt={asset.name}
                        draggable={false}
                        className="w-full h-full object-cover select-none pointer-events-none"
                      />

                      {/* Dropdown Menu for keyboard/touch Move */}
                      {isMenuOpen && (
                        <div
                          ref={menuRef}
                          role="menu"
                          aria-label="Move to page"
                          onClick={(e) => e.stopPropagation()}
                          className="absolute top-0 left-0 z-40 bg-surface border border-line rounded-[12px] shadow-lg p-1.5 min-w-[130px] flex flex-col gap-1 text-left"
                        >
                          <span className="text-[11px] font-bold uppercase tracking-wider text-faint px-2 py-1 select-none">
                            Move to
                          </span>
                          {cards.map((targetCard, tIdx) => {
                            if (targetCard.id === card.id) return null;
                            const isFull = targetCard.assetIds.length >= 12;

                            return (
                              <button
                                key={targetCard.id}
                                role="menuitem"
                                type="button"
                                disabled={isFull}
                                onClick={() =>
                                  movePicture(
                                    assetId,
                                    card.id,
                                    targetCard.id
                                  )
                                }
                                className="w-full text-left px-2 py-1.5 text-xs rounded-[6px] hover:bg-surface2 hover:text-blue disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ink cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue"
                              >
                                Page {tIdx + 1}
                              </button>
                            );
                          })}
                          <button
                            role="menuitem"
                            type="button"
                            onClick={() =>
                              movePicture(assetId, card.id, 'new')
                            }
                            className="w-full text-left px-2 py-1.5 text-xs rounded-[6px] border-t border-line text-blue hover:bg-surface2 font-bold cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue"
                          >
                            New page
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Dashed Empty Card "+ New page" */}
        <div
          role="button"
          tabIndex={0}
          onClick={handleAddNewPage}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleAddNewPage();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
          }}
          onDragEnter={(e) => {
            e.preventDefault();
            setDragOverCardId('new-card-drop');
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            if (dragOverCardId === 'new-card-drop') {
              setDragOverCardId(null);
            }
          }}
          onDrop={(e) => {
            e.preventDefault();
            setDragOverCardId(null);
            try {
              const data = JSON.parse(e.dataTransfer.getData('text/plain'));
              if (data?.assetId && data?.fromCardId) {
                movePicture(data.assetId, data.fromCardId, 'new');
              }
            } catch {
              // Ignore invalid drag data
            }
          }}
          className={`w-[240px] min-w-[240px] min-h-[196px] rounded-[16px] border-[1.5px] border-dashed flex flex-col items-center justify-center gap-2 text-sm font-bold text-muted hover:text-blue hover:border-blue cursor-pointer transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue ${
            dragOverCardId === 'new-card-drop'
              ? 'border-blue bg-blue-tint text-blue'
              : 'border-line bg-surface2/50'
          }`}
        >
          <Plus className="w-5 h-5" />
          <span>New page</span>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-6 pt-5 border-t border-line flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 text-[14px] text-muted select-none">
          <Check className="w-4 h-4 text-green stroke-[2.5]" />
          <span>Nothing is cropped or stretched</span>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleCancel}
            className="h-[48px] px-6 rounded-[14px] border-[1.5px] border-line2 bg-transparent text-ink font-bold text-[16px] hover:border-blue hover:text-blue transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleContinue}
            className="h-[48px] px-7 rounded-[14px] bg-red text-on-red font-bold text-[16px] flex items-center gap-2 hover:opacity-90 shadow-[0_8px_24px_-6px_rgba(244,112,103,0.55)] transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
          >
            <span>Continue</span>
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
