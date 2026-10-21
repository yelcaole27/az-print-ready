'use client';

import { create } from 'zustand';
import { nanoid } from 'nanoid';
import {
  PriceSettings,
  PaperTypeSetting,
  DEFAULT_PRICE_SETTINGS,
  DEFAULT_BY_PAGE,
  createDefaultByPhoto,
  loadPriceSettings,
  savePriceSettings,
} from '@/lib/pricing';

interface PriceStoreState {
  settings: PriceSettings;
  setShowPriceTotal: (show: boolean) => void;
  updatePaperType: (id: string, updater: (pt: PaperTypeSetting) => PaperTypeSetting) => void;
  addPaperType: (name: string, kind: 'by-page' | 'by-photo') => void;
  deletePaperType: (id: string) => void;
  renamePaperType: (id: string, name: string) => void;
  resetToDefaults: () => void;
}

export const usePriceStore = create<PriceStoreState>((set) => ({
  settings: loadPriceSettings(),

  setShowPriceTotal: (show) => {
    set((state) => {
      const next: PriceSettings = { ...state.settings, showPriceTotal: show };
      savePriceSettings(next);
      return { settings: next };
    });
  },

  updatePaperType: (id, updater) => {
    set((state) => {
      const nextTypes = state.settings.paperTypes.map((pt) => {
        if (pt.id !== id) return pt;
        return updater(pt);
      });
      const next: PriceSettings = { ...state.settings, paperTypes: nextTypes };
      savePriceSettings(next);
      return { settings: next };
    });
  },

  addPaperType: (name, kind) => {
    set((state) => {
      const id = nanoid();
      const newType: PaperTypeSetting = {
        id,
        name: name.trim() || 'Custom',
        kind,
        byPage: kind === 'by-page' ? JSON.parse(JSON.stringify(DEFAULT_BY_PAGE)) : undefined,
        byPhoto: kind === 'by-photo' ? createDefaultByPhoto() : undefined,
      };
      const next: PriceSettings = {
        ...state.settings,
        paperTypes: [...state.settings.paperTypes, newType],
      };
      savePriceSettings(next);
      return { settings: next };
    });
  },

  deletePaperType: (id) => {
    set((state) => {
      // Standard cannot be deleted
      if (id === 'standard') return state;
      const nextTypes = state.settings.paperTypes.filter((pt) => pt.id !== id);
      const next: PriceSettings = { ...state.settings, paperTypes: nextTypes };
      savePriceSettings(next);
      return { settings: next };
    });
  },

  renamePaperType: (id, name) => {
    set((state) => {
      // Standard cannot be renamed
      if (id === 'standard') return state;
      const nextTypes = state.settings.paperTypes.map((pt) =>
        pt.id === id ? { ...pt, name: name.trim() } : pt
      );
      const next: PriceSettings = { ...state.settings, paperTypes: nextTypes };
      savePriceSettings(next);
      return { settings: next };
    });
  },

  resetToDefaults: () => {
    const fresh = JSON.parse(JSON.stringify(DEFAULT_PRICE_SETTINGS));
    savePriceSettings(fresh);
    set({ settings: fresh });
  },
}));
