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
  thumbUrl?: string;
  previewUrl?: string;
  originalBlob?: Blob;
  originalUrl?: string;
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
  rowId?: string;
  fit?: 'contain' | 'cover' | 'stretch';
  cropGuides?: unknown;
  html?: string;
  crop?: { x: number; y: number; w: number; h: number };
  cropRect?: { x: number; y: number; w: number; h: number };
  sliceIndex?: number;
  sliceCount?: number;

  // Text specific properties
  vAlign?: 'top' | 'middle' | 'bottom';
  paddingMm?: number;
  fillColor?: string | null;
  borderMm?: number;
  borderColor?: string;
  autoGrow?: boolean;
  // Back-to-back slot mapping
  frontElementId?: string;
}

export type BlockKind = 'fit' | 'fill' | 'width' | 'collage' | 'sheet';

export type PictureTarget =
  | string
  | string[]
  | {
      assetIds?: string[];
      rowIds?: string[];
    };

export interface SheetRow {
  id?: string;
  assetId: string;
  size: { id: string; wMm: number; hMm: number };
  qty: number;
  fillPage?: boolean;
  crop?: boolean;
  cropRect?: { x: number; y: number; w: number; h: number };
}

export interface Block {
  id: string;
  kind: BlockKind;
  assetIds: string[];
  collageOption?: 'best' | 'grid' | 'column' | 'row';
  rows?: SheetRow[];
  generatedSig: string;
}

export interface Page {
  id: string;
  paperId: string;
  orientation: 'portrait' | 'landscape';
  elements: PageElement[];
  blockId?: string;
  generatedSig?: string;
  stayPut?: boolean;
  isBack?: boolean;
  frontPageId?: string;
  backPageId?: string;
  flipMode?: 'sideways' | 'upward';
  seeFront?: boolean;
}

export interface Settings {
  unit: Unit;
  marginMm: number;
  gapMm: number;
  cutStyle: 'none' | 'ticks' | 'outline';
  borderless: boolean;
  paperType?: string;
  colorMode?: 'Color' | 'B&W';
}

export interface Job {
  id: string;
  name: string;
  settings: Settings;
  pages: Page[];
  blocks: Block[];
  assetIds?: string[];
}

export interface Session {
  jobs: Job[];
  activeJobId: string;
  assets: ImageAsset[];
}

export interface OutputOptions {
  sideFilter?: 'all' | 'fronts' | 'backs';
  reverseBacks?: boolean;
  customJob?: Job;
}

export interface CheckNoticeState {
  action: 'print' | 'export';
  lines: string[];
  options?: OutputOptions;
}

