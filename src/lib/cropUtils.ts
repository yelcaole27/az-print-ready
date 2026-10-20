import type { ImageAsset } from '@/types';

export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Calculates the initial center-cover cropRect for a box with aspect ratio boxRatio.
 * If the image matches the box ratio or boxRatio <= 0, returns full image {x:0, y:0, w:1, h:1}.
 */
export function getDefaultCropRect(
  pxW: number,
  pxH: number,
  boxRatio: number
): CropRect {
  if (pxW <= 0 || pxH <= 0 || boxRatio <= 0) {
    return { x: 0, y: 0, w: 1, h: 1 };
  }

  const imageRatio = pxW / pxH;
  if (Math.abs(imageRatio - boxRatio) < 0.001) {
    return { x: 0, y: 0, w: 1, h: 1 };
  }

  if (imageRatio > boxRatio) {
    // Image is wider than box: height fills image, width is cropped and centered
    const fracW = Math.max(0.01, Math.min(1, boxRatio / imageRatio));
    const fracX = (1 - fracW) / 2;
    return {
      x: Math.round(fracX * 10000) / 10000,
      y: 0,
      w: Math.round(fracW * 10000) / 10000,
      h: 1,
    };
  } else {
    // Image is taller than box: width fills image, height is cropped and centered
    const fracH = Math.max(0.01, Math.min(1, imageRatio / boxRatio));
    const fracY = (1 - fracH) / 2;
    return {
      x: 0,
      y: Math.round(fracY * 10000) / 10000,
      w: 1,
      h: Math.round(fracH * 10000) / 10000,
    };
  }
}

/**
 * Re-fits a cropRect to a new aspect ratio, centered around the current crop center,
 * fitting inside the current crop bounds (or image bounds).
 * If the ratio is unchanged (e.g. 1x1 to 2x2), keeps the crop identical.
 */
export function refitCropRectToRatio(
  currentCrop: CropRect,
  pxW: number,
  pxH: number,
  newRatio: number
): CropRect {
  if (pxW <= 0 || pxH <= 0 || newRatio <= 0) {
    return currentCrop;
  }

  const currentPixelW = currentCrop.w * pxW;
  const currentPixelH = currentCrop.h * pxH;
  const currentRatio = currentPixelW / currentPixelH;

  // If ratio is the same, keep existing crop
  if (Math.abs(currentRatio - newRatio) < 0.002) {
    return currentCrop;
  }

  // Fraction ratio: (wFrac / hFrac) = newRatio * (pxH / pxW)
  const fracRatio = newRatio * (pxH / pxW);
  const cx = currentCrop.x + currentCrop.w / 2;
  const cy = currentCrop.y + currentCrop.h / 2;

  let newW = currentCrop.w;
  let newH = currentCrop.h;

  if (currentCrop.w / currentCrop.h > fracRatio) {
    // Current box is wider than needed: constrain height to currentCrop.h
    newH = currentCrop.h;
    newW = newH * fracRatio;
  } else {
    // Current box is taller than needed: constrain width to currentCrop.w
    newW = currentCrop.w;
    newH = newW / fracRatio;
  }

  // If out of bounds of the image [0, 1]
  if (newW > 1) {
    newW = 1;
    newH = newW / fracRatio;
  }
  if (newH > 1) {
    newH = 1;
    newW = newH * fracRatio;
  }

  let newX = cx - newW / 2;
  let newY = cy - newH / 2;

  // Clamp inside image [0, 1]
  newX = Math.max(0, Math.min(1 - newW, newX));
  newY = Math.max(0, Math.min(1 - newH, newY));

  return {
    x: Math.round(newX * 10000) / 10000,
    y: Math.round(newY * 10000) / 10000,
    w: Math.round(newW * 10000) / 10000,
    h: Math.round(newH * 10000) / 10000,
  };
}

/**
 * Scans a downscaled (~400 px) copy of the asset for near-white or transparent edges.
 * Returns a new cropRect with 1% margin, fitted to targetRatio if specified.
 * Returns null if nothing can be trimmed.
 */
export async function findTrimRect(
  asset: ImageAsset,
  targetRatio?: number
): Promise<CropRect | null> {
  const imgUrl = asset.previewUrl || asset.thumbUrl || asset.objectUrl;
  if (!imgUrl) return null;

  const img = new Image();
  img.crossOrigin = 'anonymous';

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Failed to load image for trim'));
    img.src = imgUrl;
  });

  const natW = img.naturalWidth || asset.pxW || 400;
  const natH = img.naturalHeight || asset.pxH || 400;
  const maxDim = 400;
  const scale = Math.min(1, maxDim / Math.max(natW, natH));
  const cw = Math.max(1, Math.round(natW * scale));
  const ch = Math.max(1, Math.round(natH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  ctx.drawImage(img, 0, 0, cw, ch);
  const imgData = ctx.getImageData(0, 0, cw, ch).data;

  let minX = cw;
  let maxX = -1;
  let minY = ch;
  let maxY = -1;

  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const idx = (y * cw + x) * 4;
      const r = imgData[idx];
      const g = imgData[idx + 1];
      const b = imgData[idx + 2];
      const a = imgData[idx + 3];

      // Near-white: all channels >= 245; or fully/near transparent: a < 10
      const isNearWhite = r >= 245 && g >= 245 && b >= 245;
      const isTransparent = a < 10;
      if (!isNearWhite && !isTransparent) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  // Release canvas
  canvas.width = 0;
  canvas.height = 0;

  // If no content found
  if (minX > maxX || minY > maxY) {
    return null;
  }

  // Check if content already spans 98% of width and height (nothing to trim)
  const spanW = (maxX - minX + 1) / cw;
  const spanH = (maxY - minY + 1) / ch;
  if (spanW >= 0.98 && spanH >= 0.98) {
    return null;
  }

  // 1% margin around content
  let fx = Math.max(0, minX / cw - 0.01);
  let fy = Math.max(0, minY / ch - 0.01);
  let fw = Math.min(1 - fx, (maxX - minX + 1) / cw + 0.02);
  let fh = Math.min(1 - fy, (maxY - minY + 1) / ch + 0.02);

  if (targetRatio && targetRatio > 0) {
    // Locked ratio: expand the box to the locked ratio, centered, staying inside the image
    const fracAspect = targetRatio * (natH / natW);
    const cx = fx + fw / 2;
    const cy = fy + fh / 2;

    if (fw / fh > fracAspect) {
      fh = fw / fracAspect;
    } else {
      fw = fh * fracAspect;
    }

    if (fw > 1) {
      fw = 1;
      fh = fw / fracAspect;
    }
    if (fh > 1) {
      fh = 1;
      fw = fh * fracAspect;
    }

    fx = Math.max(0, Math.min(1 - fw, cx - fw / 2));
    fy = Math.max(0, Math.min(1 - fh, cy - fh / 2));
  }

  return {
    x: Math.round(fx * 10000) / 10000,
    y: Math.round(fy * 10000) / 10000,
    w: Math.round(fw * 10000) / 10000,
    h: Math.round(fh * 10000) / 10000,
  };
}
