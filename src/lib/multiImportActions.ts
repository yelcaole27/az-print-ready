import { useSessionStore } from '@/store/useSessionStore';
import { useUiStore, MultiImportCard } from '@/store/useUiStore';
import { BlockKind } from '@/types';

export function finishMultiImport(
  cards: MultiImportCard[],
  chosenLayouts: Record<string, 'best' | 'grid' | 'column' | 'row'>,
  batchAssetIds: string[]
): void {
  const sessionStore = useSessionStore.getState();
  const uiStore = useUiStore.getState();

  const activeJob =
    sessionStore.jobs.find((j) => j.id === sessionStore.activeJobId) ||
    sessionStore.jobs[0];

  if (!activeJob) {
    uiStore.setMultiImport(null);
    return;
  }

  const specs: {
    kind: BlockKind;
    assetIds: string[];
    collageOption?: 'best' | 'grid' | 'column' | 'row';
  }[] = cards.map((card) => {
    if (card.assetIds.length === 1) {
      return {
        kind: 'fit',
        assetIds: card.assetIds,
      };
    }
    return {
      kind: 'collage',
      assetIds: card.assetIds,
      collageOption: chosenLayouts[card.id] || 'best',
    };
  });

  const res = sessionStore.addBlocks(activeJob.id, specs);

  if (!res.ok) {
    uiStore.setMessage({
      type: 'warn',
      text: res.reason || 'Could not place images.',
    });
    return;
  }

  uiStore.setLayoutMode('document');
  uiStore.setDocFit('fit-page');

  if (res.firstPageId) {
    uiStore.setActivePage(res.firstPageId);
  }

  if (batchAssetIds.length > 0) {
    uiStore.setActiveAssetId(batchAssetIds[batchAssetIds.length - 1]);
  }

  uiStore.setMultiImport(null);
}
