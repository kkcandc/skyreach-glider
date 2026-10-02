export type SaveData = {
  motes: string[];
  marks: string[];
  trials: Record<string, number>;
  stats: {
    play: number;
    walked: number;
    flown: number;
    maxAlt: number;
    maxSpeed: number;
    launches: number;
    landings: number;
  };
  settings: { sens: number; invert: boolean; time: number; auto: boolean };
};

const KEY = 'skyreach-halcyon-v1';

export function emptySave(): SaveData {
  return {
    motes: [],
    marks: [],
    trials: {},
    stats: { play: 0, walked: 0, flown: 0, maxAlt: 0, maxSpeed: 0, launches: 0, landings: 0 },
    settings: { sens: 0.00215, invert: false, time: 0.73, auto: false },
  };
}

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptySave();
    const parsed = JSON.parse(raw) as SaveData;
    return {
      ...emptySave(),
      ...parsed,
      stats: { ...emptySave().stats, ...parsed.stats },
      settings: { ...emptySave().settings, ...parsed.settings },
    };
  } catch {
    return emptySave();
  }
}

export function writeSave(data: SaveData) {
  localStorage.setItem(KEY, JSON.stringify(data));
}
