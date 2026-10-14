import { nanoid } from 'nanoid';
import { ImageAsset } from '@/types';
import { useSessionStore } from '@/store/useSessionStore';
import { useUiStore } from '@/store/useUiStore';

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
      const objectUrl = URL.createObjectURL(file);
      const dims = await new Promise<{ pxW: number; pxH: number }>((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          resolve({ pxW: img.naturalWidth, pxH: img.naturalHeight });
        };
        img.onerror = () => {
          reject(new Error('Image decode error'));
        };
        img.src = objectUrl;
      });

      validAssets.push({
        id: nanoid(),
        name: file.name,
        objectUrl,
        pxW: dims.pxW,
        pxH: dims.pxH,
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

    const isStartState =
      !activeJob ||
      activeJob.pages.every((p) => !p.elements || p.elements.length === 0);

    // Add assets to session store (does NOT create undo history for assets)
    sessionStore.addAssets(validAssets);
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
          const pageCount = updatedJob?.pages.length || 1;
          uiStore.setMessage({
            type: 'info',
            text: `Ready. ${pageCount} page(s)`,
          });
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
          uiStore.setMessage({
            type: 'info',
            text: 'Added',
          });
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
