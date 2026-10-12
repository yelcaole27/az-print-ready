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
    const { addAssets } = useSessionStore.getState();
    const { setActiveAssetId } = useUiStore.getState();
    addAssets(validAssets);
    setActiveAssetId(validAssets[validAssets.length - 1].id);
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
