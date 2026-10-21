import { Job, Page } from '@/types';
import { PAPERS } from '@/lib/constants/papers';
import { printableRect } from '@/lib/packing';

export const PESO_SYMBOL = '₱';

export function formatPeso(amount: number): string {
  return `${PESO_SYMBOL}${amount}`;
}

export interface NamedSize {
  id: string;
  name: string;
  wMm: number;
  hMm: number;
}

export const NAMED_SIZES: NamedSize[] = [
  { id: '1x1', name: '1x1', wMm: 25.4, hMm: 25.4 },
  { id: '1.5x1.5', name: '1.5x1.5', wMm: 38.1, hMm: 38.1 },
  { id: 'passport', name: 'Passport', wMm: 35, hMm: 45 },
  { id: '2x2', name: '2x2', wMm: 50.8, hMm: 50.8 },
  { id: 'cute', name: 'Cute', wMm: 50.8, hMm: 76.2 },
  { id: 'wallet', name: 'Wallet', wMm: 63.5, hMm: 88.9 },
  { id: '3r', name: '3R', wMm: 88.9, hMm: 127 },
  { id: '4r', name: '4R', wMm: 101.6, hMm: 152.4 },
  { id: '5r', name: '5R', wMm: 127, hMm: 177.8 },
  { id: '6r', name: '6R', wMm: 152.4, hMm: 203.2 },
  { id: 'a5', name: 'A5', wMm: 148, hMm: 210 },
  { id: '8r', name: '8R', wMm: 203.2, hMm: 254 },
  { id: 'a4', name: 'A4', wMm: 210, hMm: 297 },
];

export function matchNamedSize(wMm: number, hMm: number): NamedSize | null {
  for (const s of NAMED_SIZES) {
    if (
      (Math.abs(wMm - s.wMm) <= 1 && Math.abs(hMm - s.hMm) <= 1) ||
      (Math.abs(wMm - s.hMm) <= 1 && Math.abs(hMm - s.wMm) <= 1)
    ) {
      return s;
    }
  }
  return null;
}

export function roundUpNamedSize(wMm: number, hMm: number): NamedSize {
  const exact = matchNamedSize(wMm, hMm);
  if (exact) return exact;

  const candidates = NAMED_SIZES.filter((s) => {
    return (
      (wMm <= s.wMm + 0.01 && hMm <= s.hMm + 0.01) ||
      (wMm <= s.hMm + 0.01 && hMm <= s.wMm + 0.01)
    );
  });

  if (candidates.length === 0) {
    return NAMED_SIZES.find((s) => s.id === 'a4') || NAMED_SIZES[NAMED_SIZES.length - 1];
  }

  candidates.sort((a, b) => a.wMm * a.hMm - b.wMm * b.hMm);
  return candidates[0];
}

export interface PagePriceRow {
  colorFull: number;
  colorHalf: number;
  bwFull: number;
  bwHalf: number;
}

export interface ByPagePricing {
  pageSizes: {
    letter: PagePriceRow;
    a4: PagePriceRow;
    long: PagePriceRow;
    other: PagePriceRow;
  };
  photoSizes: Record<string, number>;
}

export interface IdPackage {
  id: string;
  name: string;
  label?: string;
  price: number;
  items: { sizeId: string; count: number }[];
}

export interface ByPhotoPricing {
  photoSizes: Record<string, { price: number; minPieces?: number }>;
  idPerPiece: Record<string, number>;
  idPackages: IdPackage[];
}

export interface PaperTypeSetting {
  id: string;
  name: string;
  kind: 'by-page' | 'by-photo';
  byPage?: ByPagePricing;
  byPhoto?: ByPhotoPricing;
}

export interface PriceSettings {
  version: number;
  showPriceTotal: boolean;
  paperTypes: PaperTypeSetting[];
}

export const DEFAULT_BY_PAGE: ByPagePricing = {
  pageSizes: {
    letter: { colorFull: 10, colorHalf: 7, bwFull: 7, bwHalf: 5 },
    a4: { colorFull: 10, colorHalf: 7, bwFull: 7, bwHalf: 5 },
    long: { colorFull: 13, colorHalf: 9, bwFull: 9, bwHalf: 6 },
    other: { colorFull: 10, colorHalf: 7, bwFull: 7, bwHalf: 5 },
  },
  photoSizes: {
    cute: 8,
    wallet: 10,
    '3r': 5,
    '4r': 8,
    '5r': 9,
    '6r': 10,
    a5: 10,
    '8r': 10,
  },
};

export const DEFAULT_BY_PHOTO_ITEMS = {
  photoSizes: {
    cute: { price: 5, minPieces: 4 },
    wallet: { price: 5, minPieces: 6 },
    '3r': { price: 12 },
    '4r': { price: 18 },
    '5r': { price: 22 },
    '6r': { price: 25 },
    a5: { price: 27 },
    '8r': { price: 40 },
    a4: { price: 50 },
  },
  idPerPiece: {
    '1x1': 7,
    '1.5x1.5': 8,
    '2x2': 10,
    passport: 6,
  },
  idPackages: [
    {
      id: 'p1',
      name: 'Package 1',
      label: '1x1 x 6',
      price: 40,
      items: [{ sizeId: '1x1', count: 6 }],
    },
    {
      id: 'p2',
      name: 'Package 2',
      label: '2x2 x 4',
      price: 40,
      items: [{ sizeId: '2x2', count: 4 }],
    },
    {
      id: 'p3',
      name: 'Package 3',
      label: '1x1 x 6 + 2x2 x 3',
      price: 60,
      items: [
        { sizeId: '1x1', count: 6 },
        { sizeId: '2x2', count: 3 },
      ],
    },
    {
      id: 'p4',
      name: 'Package 4',
      label: 'Passport x 9',
      price: 50,
      items: [{ sizeId: 'passport', count: 9 }],
    },
    {
      id: 'p5',
      name: 'Package 5',
      label: '1x1 x 8 + 2x2 x 4',
      price: 70,
      items: [
        { sizeId: '1x1', count: 8 },
        { sizeId: '2x2', count: 4 },
      ],
    },
  ],
};

export function createDefaultByPhoto(): ByPhotoPricing {
  return JSON.parse(JSON.stringify(DEFAULT_BY_PHOTO_ITEMS));
}

export const DEFAULT_PRICE_SETTINGS: PriceSettings = {
  version: 2,
  showPriceTotal: true,
  paperTypes: [
    {
      id: 'standard',
      name: 'Standard',
      kind: 'by-page',
      byPage: JSON.parse(JSON.stringify(DEFAULT_BY_PAGE)),
    },
    {
      id: 'photo',
      name: 'Photo',
      kind: 'by-photo',
      byPhoto: createDefaultByPhoto(),
    },
    {
      id: 'sticker',
      name: 'Sticker',
      kind: 'by-photo',
      byPhoto: createDefaultByPhoto(),
    },
    {
      id: 'matte',
      name: 'Matte',
      kind: 'by-photo',
      byPhoto: createDefaultByPhoto(),
    },
  ],
};

export const PRICE_STORAGE_KEY = 'azpr-prices';

export function loadPriceSettings(): PriceSettings {
  if (typeof window === 'undefined') return DEFAULT_PRICE_SETTINGS;
  try {
    const raw = localStorage.getItem(PRICE_STORAGE_KEY);
    if (!raw) return DEFAULT_PRICE_SETTINGS;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.paperTypes)) {
      return DEFAULT_PRICE_SETTINGS;
    }
    // Migrate package names if they were P1..P5
    for (const pt of parsed.paperTypes) {
      if (pt.byPhoto?.idPackages) {
        for (const pkg of pt.byPhoto.idPackages) {
          if (/^P\d+$/i.test(pkg.name)) {
            pkg.name = pkg.name.replace(/^P(\d+)$/i, 'Package $1');
          }
        }
      }
    }
    parsed.version = 2;
    return parsed;
  } catch {
    return DEFAULT_PRICE_SETTINGS;
  }
}

export function savePriceSettings(settings: PriceSettings): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(PRICE_STORAGE_KEY, JSON.stringify(settings));
  } catch {}
}

export interface PricingResult {
  total: number;
  lines: string[];
  warnings: string[];
  paperTypeName: string;
  isPremium: boolean;
}

function getPagePaperDimensions(page: Page): { w: number; h: number } {
  const info = PAPERS.find((p) => p.id === page.paperId) || PAPERS[0];
  const isLandscape = page.orientation === 'landscape';
  return {
    w: isLandscape ? info.heightMm : info.widthMm,
    h: isLandscape ? info.widthMm : info.heightMm,
  };
}

function getPageSizeCategory(paperId: string): 'letter' | 'a4' | 'long' | 'other' {
  const norm = (paperId || '').toLowerCase();
  if (norm === 'letter') return 'letter';
  if (norm === 'a4') return 'a4';
  if (norm === 'long' || norm === 'legal') return 'long';
  return 'other';
}

function getPicturesOnPage(page: Page): { w: number; h: number }[] {
  if (!page.elements || page.elements.length === 0) return [];
  return page.elements
    .filter((el) => el.assetId || el.rowId)
    .map((el) => ({ w: el.wMm, h: el.hMm }));
}

interface PackagePlan {
  cost: number;
  packageCounts: Record<string, number>;
  rem1x1: number;
  rem2x2: number;
}

function optimizePackages1x1And2x2(
  c1: number,
  c2: number,
  p1Price: number,
  p2Price: number,
  p3Price: number,
  p5Price: number,
  unit1: number,
  unit2: number
): PackagePlan {
  let bestCost = c1 * unit1 + c2 * unit2;
  let bestPlan: PackagePlan = {
    cost: bestCost,
    packageCounts: { p1: 0, p2: 0, p3: 0, p5: 0 },
    rem1x1: c1,
    rem2x2: c2,
  };

  const maxP5 = Math.min(Math.floor(c1 / 8), Math.floor(c2 / 4));
  for (let n5 = 0; n5 <= maxP5; n5++) {
    const after5_c1 = c1 - n5 * 8;
    const after5_c2 = c2 - n5 * 4;

    const maxP3 = Math.min(Math.floor(after5_c1 / 6), Math.floor(after5_c2 / 3));
    for (let n3 = 0; n3 <= maxP3; n3++) {
      const after3_c1 = after5_c1 - n3 * 6;
      const after3_c2 = after5_c2 - n3 * 3;

      const maxP1 = Math.floor(after3_c1 / 6);
      for (let n1 = 0; n1 <= maxP1; n1++) {
        const rem1 = after3_c1 - n1 * 6;

        const maxP2 = Math.floor(after3_c2 / 4);
        for (let n2 = 0; n2 <= maxP2; n2++) {
          const rem2 = after3_c2 - n2 * 4;

          const currentCost =
            n5 * p5Price +
            n3 * p3Price +
            n1 * p1Price +
            n2 * p2Price +
            rem1 * unit1 +
            rem2 * unit2;

          if (currentCost < bestCost) {
            bestCost = currentCost;
            bestPlan = {
              cost: currentCost,
              packageCounts: { p1: n1, p2: n2, p3: n3, p5: n5 },
              rem1x1: rem1,
              rem2x2: rem2,
            };
          }
        }
      }
    }
  }

  return bestPlan;
}

export function calculateJobPrice(
  job: Job,
  priceSettings: PriceSettings = DEFAULT_PRICE_SETTINGS
): PricingResult {
  const paperTypeKey = job.settings.paperType || 'Standard';
  const paperSetting =
    priceSettings.paperTypes.find(
      (pt) => pt.name.toLowerCase() === paperTypeKey.toLowerCase()
    ) ||
    priceSettings.paperTypes.find((pt) => pt.id === 'standard') ||
    priceSettings.paperTypes[0] ||
    DEFAULT_PRICE_SETTINGS.paperTypes[0];

  const colorMode = job.settings.colorMode || 'Color';
  const isColor = colorMode === 'Color';
  const isPremium = paperSetting.kind === 'by-photo';

  const warnings: string[] = [];
  const lines: string[] = [];

  // Warning if premium paper is used but page paper size is not A4
  if (isPremium) {
    const hasNonA4 = job.pages.some((p) => p.paperId !== 'a4');
    if (hasNonA4) {
      warnings.push('Photo paper is A4.');
    }
  }

  // Filter only pages that have pictures
  const pagesWithPics: { page: Page; pageNum: number; pics: { w: number; h: number }[] }[] = [];
  job.pages.forEach((page, idx) => {
    const pics = getPicturesOnPage(page);
    if (pics.length > 0) {
      pagesWithPics.push({ page, pageNum: idx + 1, pics });
    }
  });

  if (pagesWithPics.length === 0) {
    return {
      total: 0,
      lines: ['No pictures'],
      warnings,
      paperTypeName: paperSetting.name,
      isPremium,
    };
  }

  // --- Case 1: Price by Page (Standard and custom by-page) ---
  if (paperSetting.kind === 'by-page') {
    const byPage = paperSetting.byPage || DEFAULT_BY_PAGE;
    let total = 0;

    for (const item of pagesWithPics) {
      const { page, pageNum, pics } = item;
      const pageCat = getPageSizeCategory(page.paperId);
      const rates = byPage.pageSizes[pageCat] || byPage.pageSizes.other;

      const fullPrice = isColor ? rates.colorFull : rates.bwFull;
      const halfPrice = isColor ? rates.colorHalf : rates.bwHalf;

      // Check if EVERY picture on this page matches a named size in byPage.photoSizes
      const matchedPhotoSizes: NamedSize[] = [];
      let allMatchNamed = true;

      for (const pic of pics) {
        const matched = matchNamedSize(pic.w, pic.h);
        if (matched && typeof byPage.photoSizes[matched.id] === 'number') {
          matchedPhotoSizes.push(matched);
        } else {
          allMatchNamed = false;
          break;
        }
      }

      if (allMatchNamed && matchedPhotoSizes.length > 0) {
        const sumPhotoPrices = matchedPhotoSizes.reduce(
          (sum, s) => sum + (byPage.photoSizes[s.id] || 0),
          0
        );

        const pageLabel = page.isBack ? `Back of ${pageNum}` : `Page ${pageNum}`;

        // Group counts for clean display
        const counts = new Map<string, number>();
        matchedPhotoSizes.forEach((s) => counts.set(s.name, (counts.get(s.name) || 0) + 1));
        const itemsSummary = Array.from(counts.entries())
          .map(([name, count]) => `${count > 1 ? count + ' ' : ''}${name}`)
          .join(', ');

        if (sumPhotoPrices > fullPrice) {
          total += fullPrice;
          lines.push(`${pageLabel}: ${itemsSummary} = ${fullPrice} (capped)`);
        } else {
          total += sumPhotoPrices;
          lines.push(`${pageLabel}: ${itemsSummary} = ${sumPhotoPrices}`);
        }
      } else {
        // Coverage rule: sum of picture areas / page printable area
        const pageDim = getPagePaperDimensions(page);
        const margin = job.settings.borderless ? 0 : (job.settings.marginMm ?? 6.35);
        const pRect = printableRect(pageDim.w, pageDim.h, margin);
        const printableArea = Math.max(1, pRect.w * pRect.h);

        const totalPicArea = pics.reduce((acc, p) => acc + p.w * p.h, 0);
        const coverage = totalPicArea / printableArea;
        const isFull = coverage > 0.5;
        const pagePrice = isFull ? fullPrice : halfPrice;

        total += pagePrice;
        const pageLabel = page.isBack ? `Back of ${pageNum}` : `Page ${pageNum}`;
        const coverageLabel = isFull ? 'full' : 'half';
        const modeLabel = isColor ? 'color' : 'B&W';
        lines.push(`${pageLabel}: ${coverageLabel}, ${modeLabel} ${pagePrice}`);
      }
    }

    return {
      total,
      lines,
      warnings,
      paperTypeName: paperSetting.name,
      isPremium: false,
    };
  }

  // --- Case 2: Price by Photo (Photo, Sticker, Matte, etc.) ---
  const byPhoto = paperSetting.byPhoto || createDefaultByPhoto();

  // Aggregate pictures across the whole job by named size (with round-up rule)
  const sizeCounts = new Map<string, number>();
  for (const item of pagesWithPics) {
    for (const pic of item.pics) {
      const size = roundUpNamedSize(pic.w, pic.h);
      sizeCounts.set(size.id, (sizeCounts.get(size.id) || 0) + 1);
    }
  }

  let total = 0;

  // 1. ID photo packages & per-piece for 1x1, 2x2, Passport, 1.5x1.5
  const count1x1 = sizeCounts.get('1x1') || 0;
  const count2x2 = sizeCounts.get('2x2') || 0;
  const countPassport = sizeCounts.get('passport') || 0;
  const count15 = sizeCounts.get('1.5x1.5') || 0;

  // Passport package optimization (P4: 9 Passport = 50 vs per piece 6)
  if (countPassport > 0) {
    const p4 = byPhoto.idPackages.find((p) => p.id === 'p4') || { price: 50 };
    const passportUnit = byPhoto.idPerPiece['passport'] ?? 6;
    const numP4 = Math.floor(countPassport / 9);
    const remPassport = countPassport % 9;

    const packageCost = numP4 * p4.price + remPassport * passportUnit;
    const individualCost = countPassport * passportUnit;

    if (numP4 > 0 && packageCost <= individualCost) {
      total += packageCost;
      lines.push(
        numP4 > 1
          ? `Package 4 x ${numP4}: Passport x ${numP4 * 9} = ${numP4 * p4.price}`
          : `Package 4: Passport x 9 = ${p4.price}`
      );
      if (remPassport > 0) {
        lines.push(`Passport x ${remPassport} = ${remPassport * passportUnit}`);
      }
    } else {
      total += individualCost;
      lines.push(`Passport x ${countPassport} = ${individualCost}`);
    }
  }

  // 1x1 and 2x2 package optimization
  if (count1x1 > 0 || count2x2 > 0) {
    const p1 = byPhoto.idPackages.find((p) => p.id === 'p1') || { price: 40 };
    const p2 = byPhoto.idPackages.find((p) => p.id === 'p2') || { price: 40 };
    const p3 = byPhoto.idPackages.find((p) => p.id === 'p3') || { price: 60 };
    const p5 = byPhoto.idPackages.find((p) => p.id === 'p5') || { price: 70 };

    const unit1 = byPhoto.idPerPiece['1x1'] ?? 7;
    const unit2 = byPhoto.idPerPiece['2x2'] ?? 10;

    const plan = optimizePackages1x1And2x2(
      count1x1,
      count2x2,
      p1.price,
      p2.price,
      p3.price,
      p5.price,
      unit1,
      unit2
    );

    total += plan.cost;

    if (plan.packageCounts.p5 > 0) {
      lines.push(
        `Package 5${plan.packageCounts.p5 > 1 ? ` x ${plan.packageCounts.p5}` : ''}: 1x1 x ${plan.packageCounts.p5 * 8} + 2x2 x ${plan.packageCounts.p5 * 4} = ${plan.packageCounts.p5 * p5.price}`
      );
    }
    if (plan.packageCounts.p3 > 0) {
      lines.push(
        `Package 3${plan.packageCounts.p3 > 1 ? ` x ${plan.packageCounts.p3}` : ''}: 1x1 x ${plan.packageCounts.p3 * 6} + 2x2 x ${plan.packageCounts.p3 * 3} = ${plan.packageCounts.p3 * p3.price}`
      );
    }
    if (plan.packageCounts.p1 > 0) {
      lines.push(
        `Package 1${plan.packageCounts.p1 > 1 ? ` x ${plan.packageCounts.p1}` : ''}: 1x1 x ${plan.packageCounts.p1 * 6} = ${plan.packageCounts.p1 * p1.price}`
      );
    }
    if (plan.packageCounts.p2 > 0) {
      lines.push(
        `Package 2${plan.packageCounts.p2 > 1 ? ` x ${plan.packageCounts.p2}` : ''}: 2x2 x ${plan.packageCounts.p2 * 4} = ${plan.packageCounts.p2 * p2.price}`
      );
    }
    if (plan.rem1x1 > 0) {
      lines.push(`1x1 x ${plan.rem1x1} = ${plan.rem1x1 * unit1}`);
    }
    if (plan.rem2x2 > 0) {
      lines.push(`2x2 x ${plan.rem2x2} = ${plan.rem2x2 * unit2}`);
    }
  }

  // 1.5x1.5 (per piece)
  if (count15 > 0) {
    const unit15 = byPhoto.idPerPiece['1.5x1.5'] ?? 8;
    const cost = count15 * unit15;
    total += cost;
    lines.push(`1.5x1.5 x ${count15} = ${cost}`);
  }

  // 2. All other sizes (Cute, Wallet, 3R, 4R, 5R, 6R, A5, 8R, A4)
  const otherSizeKeys = ['cute', 'wallet', '3r', '4r', '5r', '6r', 'a5', '8r', 'a4'];

  for (const key of otherSizeKeys) {
    const count = sizeCounts.get(key) || 0;
    if (count === 0) continue;

    const cfg = byPhoto.photoSizes[key] || { price: 0 };
    const named = NAMED_SIZES.find((s) => s.id === key);
    const label = named ? named.name : key;

    const minPieces = cfg.minPieces || 0;
    if (minPieces > 0 && count < minPieces) {
      const chargedCount = minPieces;
      const cost = chargedCount * cfg.price;
      total += cost;
      lines.push(`${label} x ${count} = ${cost} (min. ${minPieces})`);
      warnings.push(`Min. ${minPieces} ${label} on photo paper. Use Standard paper instead.`);
    } else {
      const cost = count * cfg.price;
      total += cost;
      lines.push(`${label} x ${count} = ${cost}`);
    }
  }

  return {
    total,
    lines,
    warnings,
    paperTypeName: paperSetting.name,
    isPremium,
  };
}
