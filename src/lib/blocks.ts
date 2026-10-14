import { nanoid } from 'nanoid';
import { Block, ImageAsset, Page, Settings } from '@/types';
import { layoutDocumentImage } from '@/lib/documentLayout';
import { collageOptions, placedToElements, CollageItem } from '@/lib/collageLayout';
import { packCopies } from '@/lib/packing';
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

export function generateBlockPages(block: Block, ctx: BlockCtx): Page[] {
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

    const orderedRows = [...rows].sort((a, b) => (a.fillPage ? 1 : 0) - (b.fillPage ? 1 : 0));

    const settings: Settings = {
      unit: 'in',
      marginMm: ctx.marginMm,
      gapMm: ctx.gapMm,
      cutStyle: 'none',
      borderless: ctx.marginMm === 0,
    };

    const printableW = Math.max(0, ctx.pageWMm - 2 * ctx.marginMm);
    const printableH = Math.max(0, ctx.pageHMm - 2 * ctx.marginMm);

    for (const row of orderedRows) {
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
          type: 'info',
          text: "Some sizes don't fit this paper",
        });
        continue;
      }

      const isFill = Boolean(row.fillPage);
      const startPageIndex = isFill ? pages.length - 1 : 0;
      const targetQty = isFill ? 500 : (row.qty ?? 1);

      const packRes = packCopies({
        pages,
        startPageIndex,
        itemWMm,
        itemHMm,
        qty: targetQty,
        allowRotate: true,
        fillActiveOnly: isFill,
        settings,
        assetId: asset.id,
        fit: row.crop ? 'cover' : 'contain',
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

    return pages;
  }

  return [createEmptyPage()];
}

export function blockSignature(pages: Page[]): string {
  const parts: string[] = [`count:${pages.length}`];
  for (const page of pages) {
    parts.push('P');
    for (const el of page.elements) {
      const cropStr = el.crop
        ? `${el.crop.x.toFixed(4)},${el.crop.y.toFixed(4)},${el.crop.w.toFixed(4)},${el.crop.h.toFixed(4)}`
        : '';
      parts.push(
        [
          el.type,
          el.assetId || '',
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
  }
  return parts.join('|');
}
