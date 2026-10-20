export interface BackNudge {
  xMm: number;
  yMm: number;
}

const STORAGE_KEY = 'azpr-backnudge';

export const DEFAULT_BACK_NUDGE: BackNudge = {
  xMm: 0,
  yMm: 0,
};

function clampNudge(val: number): number {
  if (isNaN(val)) return 0;
  const clamped = Math.max(-5.0, Math.min(5.0, val));
  return Math.round(clamped * 10) / 10;
}

export function getBackNudge(): BackNudge {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_BACK_NUDGE };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_BACK_NUDGE };
    const parsed = JSON.parse(raw);
    return {
      xMm: clampNudge(Number(parsed.xMm ?? 0)),
      yMm: clampNudge(Number(parsed.yMm ?? 0)),
    };
  } catch {
    return { ...DEFAULT_BACK_NUDGE };
  }
}

export function setBackNudge(nudge: Partial<BackNudge>): BackNudge {
  const current = getBackNudge();
  const next: BackNudge = {
    xMm: nudge.xMm !== undefined ? clampNudge(nudge.xMm) : current.xMm,
    yMm: nudge.yMm !== undefined ? clampNudge(nudge.yMm) : current.yMm,
  };
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // storage unavailable
    }
  }
  return next;
}

export function resetBackNudge(): BackNudge {
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // storage unavailable
    }
  }
  return { ...DEFAULT_BACK_NUDGE };
}
