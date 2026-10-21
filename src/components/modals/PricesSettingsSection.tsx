'use client';

import React, { useState } from 'react';
import { Plus, Trash2, Edit2, RotateCcw, Check, X } from 'lucide-react';
import { usePriceStore } from '@/store/usePriceStore';
import { useUiStore } from '@/store/useUiStore';
import {
  PaperTypeSetting,
  IdPackage,
  PESO_SYMBOL,
} from '@/lib/pricing';

export function PricesSettingsSection() {
  const {
    settings,
    setShowPriceTotal,
    updatePaperType,
    addPaperType,
    deletePaperType,
    renamePaperType,
    resetToDefaults,
  } = usePriceStore();

  const openConfirmModal = useUiStore((s) => s.openConfirmModal);

  const [selectedTypeId, setSelectedTypeId] = useState<string>('standard');
  const [isAddingType, setIsAddingType] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');
  const [newTypeKind, setNewTypeKind] = useState<'by-page' | 'by-photo'>('by-photo');

  const [isRenaming, setIsRenaming] = useState(false);
  const [renameVal, setRenameVal] = useState('');

  // Selected paper type (fall back to standard if deleted)
  const currentType =
    settings.paperTypes.find((pt) => pt.id === selectedTypeId) ||
    settings.paperTypes[0] ||
    null;

  const handleReset = () => {
    openConfirmModal({
      title: 'Reset',
      accentWord: 'prices?',
      message: 'This will restore all prices and paper types to the suggested defaults.',
      confirmLabel: 'Reset prices',
      destructive: true,
      onConfirm: () => {
        resetToDefaults();
        setSelectedTypeId('standard');
      },
    });
  };

  const handleStartAdd = () => {
    setIsAddingType(true);
    setNewTypeName('');
    setNewTypeKind('by-photo');
  };

  const handleConfirmAdd = () => {
    if (!newTypeName.trim()) return;
    addPaperType(newTypeName.trim(), newTypeKind);
    setIsAddingType(false);
    setNewTypeName('');
  };

  const handleStartRename = () => {
    if (!currentType || currentType.id === 'standard') return;
    setIsRenaming(true);
    setRenameVal(currentType.name);
  };

  const handleConfirmRename = () => {
    if (!currentType || !renameVal.trim()) {
      setIsRenaming(false);
      return;
    }
    renamePaperType(currentType.id, renameVal.trim());
    setIsRenaming(false);
  };

  const handleDeleteCurrent = () => {
    if (!currentType || currentType.id === 'standard') return;
    openConfirmModal({
      title: 'Delete',
      accentWord: `${currentType.name}?`,
      message: `This will remove the "${currentType.name}" paper type.`,
      confirmLabel: 'Delete paper type',
      destructive: true,
      onConfirm: () => {
        deletePaperType(currentType.id);
        setSelectedTypeId('standard');
      },
    });
  };

  return (
    <section className="flex flex-col gap-4 border-t border-line pt-4">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <h3 className="text-[11.5px] font-bold uppercase tracking-[0.14em] text-faint">
            Prices
          </h3>
          <p className="text-[12.5px] text-muted">
            Set customer rates per sheet or photo.
          </p>
        </div>

        {/* Reset to suggested button */}
        <button
          type="button"
          onClick={handleReset}
          className="text-xs text-blue hover:underline font-semibold flex items-center gap-1 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue rounded-[6px] px-1"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset to suggested</span>
        </button>
      </div>

      {/* Show price total switch */}
      <div className="flex items-center justify-between bg-surface2 px-3.5 py-2.5 rounded-[14px] border border-line">
        <div className="flex flex-col">
          <span className="text-[13.5px] font-semibold text-ink">
            Show price total
          </span>
          <span className="text-[12px] text-muted">
            Display live job total in the right panel.
          </span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={settings.showPriceTotal}
          onClick={() => setShowPriceTotal(!settings.showPriceTotal)}
          className={`w-[42px] h-[24px] rounded-[12px] p-[2px] transition-colors relative cursor-pointer border-[1.5px] ${
            settings.showPriceTotal ? 'bg-blue border-blue' : 'bg-transparent border-line2'
          } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue`}
        >
          <span
            className={`block w-[16px] h-[16px] rounded-full transition-transform ${
              settings.showPriceTotal ? 'translate-x-[18px] bg-white' : 'translate-x-0 bg-faint'
            }`}
          />
        </button>
      </div>

      {/* Paper Types Tabs */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-faint">
            Paper Types
          </span>
          {!isAddingType && (
            <button
              type="button"
              onClick={handleStartAdd}
              className="text-xs text-blue hover:underline font-semibold flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add paper type</span>
            </button>
          )}
        </div>

        {/* Paper type selector pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {settings.paperTypes.map((pt) => {
            const isSelected = currentType?.id === pt.id;
            return (
              <button
                key={pt.id}
                type="button"
                onClick={() => {
                  setSelectedTypeId(pt.id);
                  setIsRenaming(false);
                }}
                className={`h-[34px] px-3 rounded-[10px] text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer border ${
                  isSelected
                    ? 'border-blue bg-blue-tint text-blue'
                    : 'border-line bg-surface2 text-ink hover:border-line2'
                }`}
              >
                {pt.name}
              </button>
            );
          })}
        </div>

        {/* Add paper type inline panel */}
        {isAddingType && (
          <div className="p-3 bg-surface2 border border-line rounded-[14px] flex flex-col gap-2.5">
            <span className="text-xs font-bold text-ink">New paper type</span>
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Paper type name"
                value={newTypeName}
                onChange={(e) => setNewTypeName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleConfirmAdd();
                  if (e.key === 'Escape') setIsAddingType(false);
                }}
                className="flex-1 h-[34px] px-2.5 rounded-[8px] border border-line bg-surface text-ink text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
                autoFocus
              />
              <div className="flex border border-line rounded-[8px] overflow-hidden">
                <button
                  type="button"
                  onClick={() => setNewTypeKind('by-page')}
                  className={`h-[34px] px-2 text-[11px] font-semibold transition-colors cursor-pointer ${
                    newTypeKind === 'by-page' ? 'bg-blue text-white' : 'bg-surface text-muted'
                  }`}
                >
                  By page
                </button>
                <button
                  type="button"
                  onClick={() => setNewTypeKind('by-photo')}
                  className={`h-[34px] px-2 text-[11px] font-semibold transition-colors cursor-pointer ${
                    newTypeKind === 'by-photo' ? 'bg-blue text-white' : 'bg-surface text-muted'
                  }`}
                >
                  By photo
                </button>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIsAddingType(false)}
                className="h-[30px] px-3 rounded-[8px] text-xs text-muted hover:text-ink cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmAdd}
                disabled={!newTypeName.trim()}
                className="h-[30px] px-4 rounded-[8px] bg-blue text-white text-xs font-semibold hover:bg-blue/90 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
              >
                Add
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Tables for Selected Paper Type */}
      {currentType && (
        <div className="flex flex-col gap-4 bg-surface2/60 border border-line rounded-[16px] p-3.5">
          {/* Header for current paper type */}
          <div className="flex items-center justify-between pb-2 border-b border-line">
            <div className="flex items-center gap-2">
              {isRenaming ? (
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={renameVal}
                    onChange={(e) => setRenameVal(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleConfirmRename();
                      if (e.key === 'Escape') setIsRenaming(false);
                    }}
                    className="h-[28px] px-2 rounded-[6px] border border-line bg-surface text-ink text-xs font-bold"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={handleConfirmRename}
                    className="w-7 h-7 flex items-center justify-center rounded-[6px] bg-blue text-white cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsRenaming(false)}
                    className="w-7 h-7 flex items-center justify-center rounded-[6px] border border-line text-muted cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-ink">{currentType.name}</span>
                  <span className="text-[10.5px] px-1.5 py-0.5 rounded-[6px] bg-line/60 text-muted font-medium">
                    {currentType.kind === 'by-page' ? 'Price by page' : 'Price by photo'}
                  </span>
                  {currentType.id !== 'standard' && (
                    <button
                      type="button"
                      onClick={handleStartRename}
                      className="text-muted hover:text-ink cursor-pointer p-0.5"
                      title="Rename"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}
            </div>

            {currentType.id !== 'standard' && !isRenaming && (
              <button
                type="button"
                onClick={handleDeleteCurrent}
                className="text-xs text-red hover:underline font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete</span>
              </button>
            )}
          </div>

          {/* KIND 1: Price by Page */}
          {currentType.kind === 'by-page' && currentType.byPage && (
            <div className="flex flex-col gap-4">
              {/* Table 1: Page sizes */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-faint">
                  Page sizes (₱)
                </span>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-line text-[11px] font-bold text-muted">
                        <th className="py-1.5 pr-2 font-medium">Size</th>
                        <th className="py-1.5 px-2">Color full</th>
                        <th className="py-1.5 px-2">Color half</th>
                        <th className="py-1.5 px-2">B&W full</th>
                        <th className="py-1.5 pl-2">B&W half</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line/60">
                      {(
                        [
                          { key: 'letter', label: 'Letter' },
                          { key: 'a4', label: 'A4' },
                          { key: 'long', label: 'Long' },
                          { key: 'other', label: 'Other sizes' },
                        ] as const
                      ).map(({ key, label }) => {
                        const row = currentType.byPage!.pageSizes[key];
                        return (
                          <tr key={key}>
                            <td className="py-2 pr-2 font-medium text-ink">{label}</td>
                            {(
                              [
                                'colorFull',
                                'colorHalf',
                                'bwFull',
                                'bwHalf',
                              ] as const
                            ).map((col) => (
                              <td key={col} className="py-1.5 px-1.5">
                                <div className="flex items-center gap-1">
                                  <span className="text-muted text-[11px]">{PESO_SYMBOL}</span>
                                  <input
                                    type="number"
                                    min={0}
                                    step={1}
                                    value={row[col]}
                                    onChange={(e) => {
                                      const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                                      updatePaperType(currentType.id, (pt) => ({
                                        ...pt,
                                        byPage: {
                                          ...pt.byPage!,
                                          pageSizes: {
                                            ...pt.byPage!.pageSizes,
                                            [key]: {
                                              ...pt.byPage!.pageSizes[key],
                                              [col]: val,
                                            },
                                          },
                                        },
                                      }));
                                    }}
                                    className="w-14 h-[28px] px-1.5 rounded-[6px] border border-line bg-surface text-ink text-center font-mono text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue"
                                  />
                                </div>
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Table 2: Photo sizes (price each) */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-faint">
                  Photo sizes (price each, ₱)
                </span>
                <div className="grid grid-cols-4 gap-2">
                  {(
                    [
                      { key: 'cute', label: 'Cute' },
                      { key: 'wallet', label: 'Wallet' },
                      { key: '3r', label: '3R' },
                      { key: '4r', label: '4R' },
                      { key: '5r', label: '5R' },
                      { key: '6r', label: '6R' },
                      { key: 'a5', label: 'A5' },
                      { key: '8r', label: '8R' },
                    ] as const
                  ).map(({ key, label }) => {
                    const price = currentType.byPage!.photoSizes[key] ?? 0;
                    return (
                      <div
                        key={key}
                        className="flex flex-col gap-1 bg-surface p-2 rounded-[8px] border border-line"
                      >
                        <span className="text-[11px] font-semibold text-ink">{label}</span>
                        <div className="flex items-center gap-1">
                          <span className="text-muted text-[11px]">{PESO_SYMBOL}</span>
                          <input
                            type="number"
                            min={0}
                            step={1}
                            value={price}
                            onChange={(e) => {
                              const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                              updatePaperType(currentType.id, (pt) => ({
                                ...pt,
                                byPage: {
                                  ...pt.byPage!,
                                  photoSizes: {
                                    ...pt.byPage!.photoSizes,
                                    [key]: val,
                                  },
                                },
                              }));
                            }}
                            className="w-full h-[26px] px-1 rounded-[6px] border border-line bg-surface2 text-ink text-center font-mono text-xs"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* KIND 2: Price by Photo */}
          {currentType.kind === 'by-photo' && currentType.byPhoto && (
            <div className="flex flex-col gap-4">
              {/* Table 1: Photo sizes */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-faint">
                  Photo sizes
                </span>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-line text-[11px] font-bold text-muted">
                        <th className="py-1.5 pr-2 font-medium">Size</th>
                        <th className="py-1.5 px-2">Price each</th>
                        <th className="py-1.5 pl-2">Min. pieces</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line/60">
                      {(
                        [
                          { key: 'cute', label: 'Cute' },
                          { key: 'wallet', label: 'Wallet' },
                          { key: '3r', label: '3R' },
                          { key: '4r', label: '4R' },
                          { key: '5r', label: '5R' },
                          { key: '6r', label: '6R' },
                          { key: 'a5', label: 'A5' },
                          { key: '8r', label: '8R' },
                          { key: 'a4', label: 'A4' },
                        ] as const
                      ).map(({ key, label }) => {
                        const item = currentType.byPhoto!.photoSizes[key] || { price: 0 };
                        return (
                          <tr key={key}>
                            <td className="py-1.5 pr-2 font-medium text-ink">{label}</td>
                            <td className="py-1.5 px-2">
                              <div className="flex items-center gap-1">
                                <span className="text-muted text-[11px]">{PESO_SYMBOL}</span>
                                <input
                                  type="number"
                                  min={0}
                                  step={1}
                                  value={item.price}
                                  onChange={(e) => {
                                    const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                                    updatePaperType(currentType.id, (pt) => ({
                                      ...pt,
                                      byPhoto: {
                                        ...pt.byPhoto!,
                                        photoSizes: {
                                          ...pt.byPhoto!.photoSizes,
                                          [key]: {
                                            ...pt.byPhoto!.photoSizes[key],
                                            price: val,
                                          },
                                        },
                                      },
                                    }));
                                  }}
                                  className="w-16 h-[26px] px-1.5 rounded-[6px] border border-line bg-surface text-ink text-center font-mono text-xs"
                                />
                              </div>
                            </td>
                            <td className="py-1.5 pl-2">
                              <input
                                type="number"
                                min={0}
                                step={1}
                                placeholder="None"
                                value={item.minPieces || ''}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value, 10);
                                  const minVal = isNaN(val) || val <= 0 ? undefined : val;
                                  updatePaperType(currentType.id, (pt) => ({
                                    ...pt,
                                    byPhoto: {
                                      ...pt.byPhoto!,
                                      photoSizes: {
                                        ...pt.byPhoto!.photoSizes,
                                        [key]: {
                                          ...pt.byPhoto!.photoSizes[key],
                                          minPieces: minVal,
                                        },
                                      },
                                    },
                                  }));
                                }}
                                className="w-16 h-[26px] px-1.5 rounded-[6px] border border-line bg-surface text-ink text-center font-mono text-xs"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Table 2: ID photo packages */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-faint">
                    ID photo packages
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const newPkg: IdPackage = {
                        id: 'pkg_' + Date.now(),
                        name: 'Package ' + (currentType.byPhoto!.idPackages.length + 1),
                        label: '1x1 x 6',
                        price: 40,
                        items: [{ sizeId: '1x1', count: 6 }],
                      };
                      updatePaperType(currentType.id, (pt) => ({
                        ...pt,
                        byPhoto: {
                          ...pt.byPhoto!,
                          idPackages: [...pt.byPhoto!.idPackages, newPkg],
                        },
                      }));
                    }}
                    className="text-[11px] text-blue hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Add package</span>
                  </button>
                </div>

                <div className="flex flex-col gap-1.5">
                  {currentType.byPhoto.idPackages.map((pkg, idx) => (
                    <div
                      key={pkg.id}
                      className="flex items-center justify-between gap-2 p-2 rounded-[8px] bg-surface border border-line text-xs"
                    >
                      <div className="flex items-center gap-2 flex-1">
                        <input
                          type="text"
                          value={pkg.name}
                          onChange={(e) => {
                            const val = e.target.value;
                            updatePaperType(currentType.id, (pt) => ({
                              ...pt,
                              byPhoto: {
                                ...pt.byPhoto!,
                                idPackages: pt.byPhoto!.idPackages.map((p) =>
                                  p.id === pkg.id ? { ...p, name: val } : p
                                ),
                              },
                            }));
                          }}
                          className="w-24 h-[26px] px-2 rounded border border-line bg-surface2 text-left font-bold text-xs"
                        />
                        <input
                          type="text"
                          value={pkg.label || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            updatePaperType(currentType.id, (pt) => ({
                              ...pt,
                              byPhoto: {
                                ...pt.byPhoto!,
                                idPackages: pt.byPhoto!.idPackages.map((p) =>
                                  p.id === pkg.id ? { ...p, label: val } : p
                                ),
                              },
                            }));
                          }}
                          placeholder="Contents"
                          className="flex-1 h-[26px] px-2 rounded border border-line bg-surface2 text-xs"
                        />
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span className="text-muted text-[11px]">{PESO_SYMBOL}</span>
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={pkg.price}
                          onChange={(e) => {
                            const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                            updatePaperType(currentType.id, (pt) => ({
                              ...pt,
                              byPhoto: {
                                ...pt.byPhoto!,
                                idPackages: pt.byPhoto!.idPackages.map((p) =>
                                  p.id === pkg.id ? { ...p, price: val } : p
                                ),
                              },
                            }));
                          }}
                          className="w-14 h-[26px] px-1 rounded border border-line bg-surface2 text-center font-mono text-xs font-semibold"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            updatePaperType(currentType.id, (pt) => ({
                              ...pt,
                              byPhoto: {
                                ...pt.byPhoto!,
                                idPackages: pt.byPhoto!.idPackages.filter((p) => p.id !== pkg.id),
                              },
                            }));
                          }}
                          className="text-muted hover:text-red p-1 cursor-pointer"
                          title="Delete package"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Table 3: ID photo, per piece */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-faint">
                  ID photo, per piece (₱)
                </span>
                <div className="grid grid-cols-4 gap-2">
                  {(
                    [
                      { key: '1x1', label: '1x1' },
                      { key: '1.5x1.5', label: '1.5x1.5' },
                      { key: '2x2', label: '2x2' },
                      { key: 'passport', label: 'Passport' },
                    ] as const
                  ).map(({ key, label }) => {
                    const price = currentType.byPhoto!.idPerPiece[key] ?? 0;
                    return (
                      <div
                        key={key}
                        className="flex flex-col gap-1 bg-surface p-2 rounded-[8px] border border-line"
                      >
                        <span className="text-[11px] font-semibold text-ink">{label}</span>
                        <div className="flex items-center gap-1">
                          <span className="text-muted text-[11px]">{PESO_SYMBOL}</span>
                          <input
                            type="number"
                            min={0}
                            step={1}
                            value={price}
                            onChange={(e) => {
                              const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                              updatePaperType(currentType.id, (pt) => ({
                                ...pt,
                                byPhoto: {
                                  ...pt.byPhoto!,
                                  idPerPiece: {
                                    ...pt.byPhoto!.idPerPiece,
                                    [key]: val,
                                  },
                                },
                              }));
                            }}
                            className="w-full h-[26px] px-1 rounded-[6px] border border-line bg-surface2 text-ink text-center font-mono text-xs"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
