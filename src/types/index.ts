export type Unit = 'mm' | 'cm' | 'in';

export interface PaperSize {
  id: string;
  name: string;
  widthMm: number;
  heightMm: number;
}

export interface SizePreset {
  id: string;
  name: string;
  widthMm: number;
  heightMm: number;
}

export interface ImageAsset {
  id: string;
  name: string;
  objectUrl: string;
  pxW: number;
  pxH: number;
}

export interface PageElement {
  id: string;
  type: 'image' | 'text';
  xMm: number;
  yMm: number;
  wMm: number;
  hMm: number;
  rotation: 0 | 90 | 180 | 270;
  assetId?: string;
  fit?: 'contain' | 'cover' | 'stretch';
  cropGuides?: unknown;
  html?: string;
  crop?: { x: number; y: number; w: number; h: number };
  sliceIndex?: number;
  sliceCount?: number;

  // Text specific properties
  vAlign?: 'top' | 'middle' | 'bottom';
  paddingMm?: number;
  fillColor?: string | null;
  borderMm?: number;
  borderColor?: string;
  autoGrow?: boolean;
}

export interface Page {
  id: string;
  paperId: string;
  orientation: 'portrait' | 'landscape';
  elements: PageElement[];
}

export interface Settings {
  unit: Unit;
  marginMm: number;
  gapMm: number;
  cutMarks: boolean;
}

export interface Job {
  id: string;
  name: string;
  settings: Settings;
  pages: Page[];
}

export interface Session {
  jobs: Job[];
  activeJobId: string;
  assets: ImageAsset[];
}
