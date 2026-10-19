import { nanoid } from 'nanoid';
import { Block, ImageAsset, Page, PageElement, Settings } from '@/types';
import { layoutDocumentImage } from '@/lib/documentLayout';
import { collageOptions, placedToElements, CollageItem } from '@/lib/collageLayout';
import { packCopies, findSpot, printableRect, Rect } from '@/lib/packing';
import { getPageDimensionsMm } from '@/lib/pageGeometry';
import { useUiStore } from '@/store/useUiStore';

export interface BlockCtx {
  paperId: string;
  orientation: 'portrait' | 'landscape';
  pageWMm: number;
  pageHMm: number;
  marginMm: number;
  gapMm: number;
  assetsById: Record<string, ImageAsset>;
}

function generateBlockPagesInternal(block: Block, ctx: BlockCtx): Page[] {
  const createEmptyPage = (): Page => ({
    id: nanoid(),
    paperId: ctx.paperId,
    orientation: ctx.orientation,
    elements: [],
    blockId: block.id,
  });

  if (block.kind === 'fit' || block.kind === 'fill' || block.kind === 'width') {
    const assetId = block.assetIds[0];
    const asset = assetId ? ctx.assetsById[assetId] : undefined;
    if (!asset) {
      return [createEmptyPage()];
    }

    const fitMode =
      block.kind === 'fit'
        ? 'fit-page'
        : block.kind === 'fill'
        ? 'fill-page'
        : 'fill-width';

    const pagesElements = layoutDocumentImage({
      asset,
      pageWMm: ctx.pageWMm,
      pageHMm: ctx.pageHMm,
      marginMm: ctx.marginMm,
      fit: fitMode,
      autoRotate: true,
      align: 'center',
    });

    if (pagesElements.length === 0) {
      return [createEmptyPage()];
    }

    return pagesElements.map((elements) => ({
      id: nanoid(),
      paperId: ctx.paperId,
      orientation: ctx.orientation,
      elements,
      blockId: block.id,
    }));
  }

  if (block.kind === 'collage') {
    const items: CollageItem[] = [];
    for (const id of block.assetIds) {
      const asset = ctx.assetsById[id];
      if (asset) {
        items.push({ assetId: asset.id, pxW: asset.pxW, pxH: asset.pxH });
      }
    }

    if (items.length === 0) {
      return [createEmptyPage()];
    }

    if (items.length === 1) {
      const asset = ctx.assetsById[items[0].assetId];
      const pagesElements = layoutDocumentImage({
        asset,
        pageWMm: ctx.pageWMm,
        pageHMm: ctx.pageHMm,
        marginMm: ctx.marginMm,
        fit: 'fit-page',
        autoRotate: true,
        align: 'center',
      });
      return [
        {
          id: nanoid(),
          paperId: ctx.paperId,
          orientation: ctx.orientation,
          elements: pagesElements[0] || [],
          blockId: block.id,
        },
      ];
    }

    const options = collageOptions(
      items,
      ctx.pageWMm,
      ctx.pageHMm,
      ctx.marginMm,
      ctx.gapMm
    );

    const option =
      options.find((o) => o.id === block.collageOption) || options[0];

    const elements = option ? placedToElements(option.items) : [];

    return [
      {
        id: nanoid(),
        paperId: ctx.paperId,
        orientation: ctx.orientation,
        elements,
        blockId: block.id,
      },
    ];
  }

  if (block.kind === 'sheet') {
    const pages: Page[] = [createEmptyPage()];

    const rows = block.rows || [];
    if (rows.length === 0) {
      return pages;
    }

    const orderedRows = [...rows]
      .map((r) => ({ ...r, id: r.id || nanoid() }))
      .sort((a, b) => {
        if (Boolean(a.fillPage) !== Boolean(b.fillPage)) {
          return a.fillPage ? 1 : -1;
        }
        const areaA = a.size.wMm * a.size.hMm;
        const areaB = b.size.wMm * b.size.hMm;
        if (Math.abs(areaB - areaA) > 0.01) {
          return areaB - areaA;
        }
        return 0;
      });

    const settings: Settings = {
      unit: 'in',
      marginMm: ctx.marginMm,
      gapMm: ctx.gapMm,
      cutStyle: 'none',
      borderless: ctx.marginMm === 0,
    };

    const printableW = Math.max(0, ctx.pageWMm - 2 * ctx.marginMm);
    const printableH = Math.max(0, ctx.pageHMm - 2 * ctx.marginMm);

    const nonFillRows = orderedRows.filter((r) => !r.fillPage);
    const fillRows = orderedRows.filter((r) => Boolean(r.fillPage));

    for (const row of nonFillRows) {
      const asset = ctx.assetsById[row.assetId];
      if (!asset) continue;

      let itemWMm = row.size.wMm;
      let itemHMm = row.size.hMm;

      const isAssetLandscape = asset.pxW > asset.pxH;
      const isSizeLandscape = itemWMm > itemHMm;
      if ((isAssetLandscape && !isSizeLandscape) || (!isAssetLandscape && isSizeLandscape)) {
        const temp = itemWMm;
        itemWMm = itemHMm;
        itemHMm = temp;
      }

      const fitsNormal = itemWMm <= printableW && itemHMm <= printableH;
      const fitsRotated = itemHMm <= printableW && itemWMm <= printableH;

      if (!fitsNormal && !fitsRotated) {
        useUiStore.getState().setMessage({
          type: 'warn',
          text: "Some sizes don't fit this paper",
        });
        continue;
      }

      const targetQty = row.qty ?? 1;

      const packRes = packCopies({
        pages,
        startPageIndex: 0,
        itemWMm,
        itemHMm,
        qty: targetQty,
        allowRotate: true,
        fillActiveOnly: false,
        settings,
        assetId: asset.id,
        rowId: row.id,
        fit: 'cover',
      });

      if (packRes.placements.length > 0) {
        const maxPageIndex = Math.max(...packRes.placements.map((p) => p.pageIndex));
        while (pages.length <= maxPageIndex) {
          pages.push(createEmptyPage());
        }

        for (const p of packRes.placements) {
          if (pages[p.pageIndex]) {
            pages[p.pageIndex].elements.push(p.element);
          }
        }
      }
    }

    if (fillRows.length > 0) {
      const activePageIndex = pages.length - 1;
      const page = pages[activePageIndex];
      const { wMm: pW, hMm: pH } = getPageDimensionsMm(page);
      const pPrintable = printableRect(pW, pH, settings.marginMm);
      const occupied: Rect[] = page.elements.map((el) => ({
        x: el.xMm,
        y: el.yMm,
        w: el.wMm,
        h: el.hMm,
      }));

      let placedAny = true;
      let totalFilled = 0;
      while (placedAny && totalFilled < 500) {
        placedAny = false;
        for (const row of fillRows) {
          const asset = ctx.assetsById[row.assetId];
          if (!asset) continue;

          let itemWMm = row.size.wMm;
          let itemHMm = row.size.hMm;
          const isAssetLandscape = asset.pxW > asset.pxH;
          const isSizeLandscape = itemWMm > itemHMm;
          if ((isAssetLandscape && !isSizeLandscape) || (!isAssetLandscape && isSizeLandscape)) {
            const temp = itemWMm;
            itemWMm = itemHMm;
            itemHMm = temp;
          }

          let spot = findSpot(occupied, itemWMm, itemHMm, pPrintable, settings.gapMm);
          let rotation: 0 | 90 = 0;
          if (!spot && itemWMm !== itemHMm) {
            spot = findSpot(occupied, itemHMm, itemWMm, pPrintable, settings.gapMm);
            if (spot) rotation = 90;
          }

          if (spot) {
            const element: PageElement = {
              id: nanoid(),
              type: 'image',
              xMm: spot.x,
              yMm: spot.y,
              wMm: spot.w,
              hMm: spot.h,
              rotation,
              assetId: asset.id,
              rowId: row.id,
              fit: 'cover',
              cropGuides: false,
            };
            page.elements.push(element);
            occupied.push(spot);
            totalFilled++;
            placedAny = true;
          }
        }
      }
    }

    return pages;
  }

  return [createEmptyPage()];
}

export function pageSignature(page: Page): string {
  const parts: string[] = ['P'];
  for (const el of page.elements) {
    const cropStr = el.crop
      ? `${el.crop.x.toFixed(4)},${el.crop.y.toFixed(4)},${el.crop.w.toFixed(4)},${el.crop.h.toFixed(4)}`
      : '';
    parts.push(
      [
        el.type,
        el.assetId || '',
        el.rowId || '',
        el.xMm.toFixed(2),
        el.yMm.toFixed(2),
        el.wMm.toFixed(2),
        el.hMm.toFixed(2),
        el.rotation || 0,
        el.fit || '',
        cropStr,
      ].join(':')
    );
  }
  return parts.join('|');
}

export function blockSignature(pages: Page[]): string {
  return [`count:${pages.length}`, ...pages.map(pageSignature)].join('|');
}

export function generateBlockPages(block: Block, ctx: BlockCtx): Page[] {
  const pages = generateBlockPagesInternal(block, ctx);
  for (const page of pages) {
    page.generatedSig = pageSignature(page);
    page.stayPut = false;
  }
  return pages;
}

