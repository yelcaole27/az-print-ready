import { nanoid } from 'nanoid';
import { ImageAsset } from '@/types';
import { useSessionStore } from '@/store/useSessionStore';
import { useUiStore } from '@/store/useUiStore';

async function generateImageCopies(file: File): Promise<{
  origW: number;
  origH: number;
  previewUrl: string;
  thumbUrl: string;
}> {
  const hasAlpha =
    file.type === 'image/png' ||
    file.type === 'image/webp' ||
    file.type === 'image/gif' ||
    file.type === 'image/svg+xml';
  const mimeType = hasAlpha ? 'image/png' : 'image/jpeg';
  const quality = 0.85;

  if (typeof createImageBitmap === 'function') {
    const fullBitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const origW = fullBitmap.width;
    const origH = fullBitmap.height;

    // 1600px preview (never upscale beyond original)
    const maxPrev = 1600;
    const prevScale = Math.min(1, maxPrev / Math.max(origW, origH));
    const prevW = Math.max(1, Math.round(origW * prevScale));
    const prevH = Math.max(1, Math.round(origH * prevScale));

    const prevBitmap = await createImageBitmap(fullBitmap, {
      resizeWidth: prevW,
      resizeHeight: prevH,
      resizeQuality: 'high',
    });

    // 200px thumbnail
    const maxThumb = 200;
    const thumbScale = Math.min(1, maxThumb / Math.max(origW, origH));
    const thumbW = Math.max(1, Math.round(origW * thumbScale));
    const thumbH = Math.max(1, Math.round(origH * thumbScale));

    const thumbBitmap = await createImageBitmap(fullBitmap, {
      resizeWidth: thumbW,
      resizeHeight: thumbH,
      resizeQuality: 'high',
    });

    // Close fullBitmap immediately to free original pixels
    fullBitmap.close();

    const renderToBlob = async (bitmap: ImageBitmap, w: number, h: number): Promise<Blob> => {
      if (typeof OffscreenCanvas !== 'undefined') {
        const off = new OffscreenCanvas(w, h);
        const ctx = off.getContext('2d');
        if (ctx) ctx.drawImage(bitmap, 0, 0);
        const blob = await off.convertToBlob({ type: mimeType, quality });
        off.width = 0;
        off.height = 0;
        return blob;
      } else {
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const ctx = c.getContext('2d');
        if (ctx) ctx.drawImage(bitmap, 0, 0);
        const blob = await new Promise<Blob>((resolve) => {
          c.toBlob((b) => resolve(b || new Blob()), mimeType, quality);
        });
        c.width = 0;
        c.height = 0;
        return blob;
      }
    };

    const prevBlob = await renderToBlob(prevBitmap, prevW, prevH);
    prevBitmap.close();

    const thumbBlob = await renderToBlob(thumbBitmap, thumbW, thumbH);
    thumbBitmap.close();

    const previewUrl = URL.createObjectURL(prevBlob);
    const thumbUrl = URL.createObjectURL(thumbBlob);

    return { origW, origH, previewUrl, thumbUrl };
  } else {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Image decode error'));
      img.src = objectUrl;
    });
    return {
      origW: img.naturalWidth,
      origH: img.naturalHeight,
      previewUrl: objectUrl,
      thumbUrl: objectUrl,
    };
  }
}

export async function importFiles(files: File[]): Promise<void> {
  if (!files || files.length === 0) return;

  const validAssets: ImageAsset[] = [];
  let skippedCount = 0;
  let hasHeic = false;
  let failedCount = 0;

  for (const file of files) {
    const isHeic =
      file.type === 'image/heic' ||
      file.type === 'image/heif' ||
      /\.(heic|heif)$/i.test(file.name);

    if (isHeic) {
      hasHeic = true;
      continue;
    }

    if (!file.type.startsWith('image/')) {
      skippedCount++;
      continue;
    }

    try {
      const copies = await generateImageCopies(file);

      validAssets.push({
        id: nanoid(),
        name: file.name,
        objectUrl: copies.previewUrl,
        thumbUrl: copies.thumbUrl,
        previewUrl: copies.previewUrl,
        originalBlob: file,
        pxW: copies.origW,
        pxH: copies.origH,
      });
    } catch {
      failedCount++;
    }
  }

  if (validAssets.length > 0) {
    const sessionStore = useSessionStore.getState();
    const uiStore = useUiStore.getState();

    // Check if the ACTIVE JOB is currently in start state (zero elements across all pages)
    const activeJob =
      sessionStore.jobs.find((j) => j.id === sessionStore.activeJobId) ||
      sessionStore.jobs[0];

    const totalJobPics = (activeJob?.assetIds?.length || 0) + validAssets.length;
    if (totalJobPics > 40) {
      uiStore.setMessage({
        type: 'warn',
        text: 'Many pictures: the app may get slow.',
      });
    }

    const isStartState =
      !activeJob ||
      activeJob.pages.every((p) => !p.elements || p.elements.length === 0);

    // Add assets to session store (does NOT create undo history for assets)
    sessionStore.addAssets(validAssets, activeJob?.id);
    uiStore.setActiveAssetId(validAssets[validAssets.length - 1].id);

    if (validAssets.length === 1) {
      if (isStartState && activeJob) {
        const res = sessionStore.addBlocks(activeJob.id, [
          { kind: 'fit', assetIds: [validAssets[0].id] },
        ]);
        if (res.ok) {
          uiStore.setLayoutMode('document');
          uiStore.setDocFit('fit-page');
          const updatedJob = useSessionStore
            .getState()
            .jobs.find((j) => j.id === activeJob.id);
        }
      } else if (!isStartState && activeJob) {
        const res = sessionStore.addBlocks(activeJob.id, [
          { kind: 'fit', assetIds: [validAssets[0].id] },
        ]);
        if (res.ok) {
          uiStore.setActiveAssetId(validAssets[0].id);
          if (res.firstPageId) {
            uiStore.setActivePage(res.firstPageId);
          }
        } else if (res.reason) {
          uiStore.setMessage({
            type: 'warn',
            text: res.reason,
          });
        }
      }
    } else {
      // 2 or more images: open Arrange modal with batch asset IDs in import order
      const batchAssetIds = validAssets.map((a) => a.id);
      uiStore.setMultiImport({
        step: 'arrange',
        batchAssetIds,
        cards: batchAssetIds.map((id) => ({
          id: nanoid(),
          assetIds: [id],
        })),
        layoutStepIndex: 0,
        chosenLayouts: {},
      });
    }
  }

  const { setMessage } = useUiStore.getState();
  if (hasHeic) {
    setMessage({
      type: 'warn',
      text: "HEIC photos aren't supported by browsers. Please convert to JPG.",
    });
  } else if (skippedCount > 0) {
    setMessage({
      type: 'warn',
      text: `Skipped ${skippedCount} unsupported file(s)`,
    });
  } else if (failedCount > 0) {
    setMessage({
      type: 'warn',
      text: `Failed to load ${failedCount} image(s)`,
    });
  }
}
