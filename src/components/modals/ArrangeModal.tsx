'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { nanoid } from 'nanoid';
import { useSessionStore } from '@/store/useSessionStore';
import { useUiStore, MultiImportCard } from '@/store/useUiStore';
import { ModalShell } from './ModalShell';
import { finishMultiImport } from '@/lib/multiImportActions';

export function ArrangeModal() {
  const multiImport = useUiStore((s) => s.multiImport);
  const setMultiImport = useUiStore((s) => s.setMultiImport);
  const discardAssets = useSessionStore((s) => s.discardAssets);
  const assets = useSessionStore((s) => s.assets);

  const [activeMenuAssetId, setActiveMenuAssetId] = useState<string | null>(null);
  const [dragOverCardId, setDragOverCardId] = useState<string | null>(null);
  const [limitNotice, setLimitNotice] = useState<string | null>(null);

  const menuRef = useRef<HTMLDivElement>(null);

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

  const handleCancel = () => {
    discardAssets(batchAssetIds);
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
      setLimitNotice('A page holds up to 12 pictures');
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
        const nextAssetIds = [...card.assetIds, assetId].sort(
          (a, b) => batchAssetIds.indexOf(a) - batchAssetIds.indexOf(b)
        );
        updatedCards.push({ ...card, assetIds: nextAssetIds });
      } else {
        updatedCards.push(card);
      }
    }

    setMultiImport((prev) => (prev ? { ...prev, cards: updatedCards } : null));
  };

  const handleAddNewPage = () => {
    const newCard: MultiImportCard = {
      id: nanoid(),
      assetIds: [],
    };
    setMultiImport((prev) =>
      prev ? { ...prev, cards: [...prev.cards, newCard] } : null
    );
  };

  const handleContinue = () => {
    const pagesNeedingLayout = cards.filter((c) => c.assetIds.length >= 2);
    if (pagesNeedingLayout.length === 0) {
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
      <div className="mb-4">
        <h2
          id="arrange-modal-title"
          className="text-[20px] font-semibold text-ink leading-tight"
        >
          Arrange your pictures
        </h2>
        <p className="text-[14px] text-muted mt-1">
          Drag a picture to move it to another page.
        </p>
      </div>

      {/* Quick Buttons & Limit Notice */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleEachOnOwnPage}
            className="h-[44px] px-4 rounded-[8px] border border-line bg-paper text-ink hover:border-blue hover:text-blue transition-colors text-[14px] font-medium cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
          >
            Each on its own page
          </button>
          <button
            type="button"
            onClick={handleAllOnOnePage}
            className="h-[44px] px-4 rounded-[8px] border border-line bg-paper text-ink hover:border-blue hover:text-blue transition-colors text-[14px] font-medium cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
          >
            All on 1 page
          </button>
        </div>
        {limitNotice && (
          <p className="text-[14px] text-muted font-medium">{limitNotice}</p>
        )}
      </div>

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
              className={`w-[220px] min-w-[220px] bg-surface rounded-[12px] border p-3 flex flex-col transition-all ${
                isDragTarget
                  ? 'border-2 border-dashed border-blue bg-blue/5'
                  : 'border-line'
              }`}
            >
              <div className="text-[14px] font-medium text-ink mb-2 select-none">
                Page {pageIndex + 1}
              </div>

              <div className="bg-paper border border-line rounded-[8px] p-2 min-h-[140px] flex flex-wrap gap-2 content-start">
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
                      className="w-[80px] h-[80px] rounded-[6px] border border-line hover:border-blue overflow-hidden relative cursor-grab active:cursor-grabbing transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
                    >
                      <img
                        src={asset.objectUrl}
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
                          className="absolute top-0 left-0 z-40 bg-paper border border-line rounded-[8px] shadow-lg p-1.5 min-w-[120px] flex flex-col gap-1 text-left"
                        >
                          <span className="text-[12px] font-semibold text-muted px-2 py-1 select-none">
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
                                className="w-full text-left px-2 py-1 text-[13px] rounded-[4px] hover:bg-surface hover:text-blue disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ink cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue"
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
                            className="w-full text-left px-2 py-1 text-[13px] rounded-[4px] border-t border-line text-blue hover:bg-surface font-medium cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue"
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
          className={`w-[220px] min-w-[220px] min-h-[196px] rounded-[12px] border-2 border-dashed flex flex-col items-center justify-center text-[14px] font-medium text-muted hover:text-blue hover:border-blue cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue ${
            dragOverCardId === 'new-card-drop'
              ? 'border-blue bg-blue/5 text-blue'
              : 'border-line bg-surface/30'
          }`}
        >
          + New page
        </div>
      </div>

      {/* Footer */}
      <div className="mt-6 pt-4 border-t border-line flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={handleCancel}
          className="h-[40px] px-5 rounded-[8px] border border-line bg-paper text-ink hover:border-blue hover:text-blue transition-colors text-[14px] font-medium cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleContinue}
          className="h-[40px] px-6 rounded-[8px] bg-blue-strong text-white hover:bg-blue-strong/90 transition-colors text-[14px] font-medium cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
        >
          Continue
        </button>
      </div>
    </ModalShell>
  );
}
