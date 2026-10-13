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
    const assetId = block.assetIds[0];
    const asset = assetId ? ctx.assetsById[assetId] : undefined;
    if (!asset || !block.size) {
      return [createEmptyPage()];
    }

    let itemWMm = block.size.wMm;
    let itemHMm = block.size.hMm;

    const isAssetLandscape = asset.pxW > asset.pxH;
    const isSizeLandscape = itemWMm > itemHMm;
    if ((isAssetLandscape && !isSizeLandscape) || (!isAssetLandscape && isSizeLandscape)) {
      const temp = itemWMm;
      itemWMm = itemHMm;
      itemHMm = temp;
    }

    const dummyStartPage: Page = {
      id: nanoid(),
      paperId: ctx.paperId,
      orientation: ctx.orientation,
      elements: [],
      blockId: block.id,
    };

    const settings: Settings = {
      unit: 'in',
      marginMm: ctx.marginMm,
      gapMm: ctx.gapMm,
      cutStyle: 'none',
      borderless: ctx.marginMm === 0,
    };

    const packRes = packCopies({
      pages: [dummyStartPage],
      startPageIndex: 0,
      itemWMm,
      itemHMm,
      qty: block.fillPage ? 500 : (block.qty ?? 1),
      allowRotate: true,
      fillActiveOnly: Boolean(block.fillPage),
      settings,
      assetId: asset.id,
      fit: block.crop ? 'cover' : 'contain',
    });

    if (packRes.error || packRes.placedCount === 0) {
      useUiStore.getState().setMessage({
        type: 'info',
        text: "Some sizes don't fit this paper",
      });

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

    const maxPageIndex = Math.max(0, ...packRes.placements.map((p) => p.pageIndex));
    const resultPages: Page[] = [];

    for (let i = 0; i <= maxPageIndex; i++) {
      resultPages.push({
        id: i === 0 ? dummyStartPage.id : nanoid(),
        paperId: ctx.paperId,
        orientation: ctx.orientation,
        elements: [],
        blockId: block.id,
      });
    }

    for (const p of packRes.placements) {
      if (resultPages[p.pageIndex]) {
        resultPages[p.pageIndex].elements.push(p.element);
      }
    }

    return resultPages;
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
