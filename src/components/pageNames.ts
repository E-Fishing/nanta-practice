/**
 * Bilingual page names (DESIGN.md §5). Nav items and page titles show the Korean as display text
 * with the English label beneath; buttons and controls stay English.
 */
export interface PageName {
  ko: string;
  en: string;
}

export const PAGE_NAMES = {
  brand: { ko: '난타 연습', en: 'Nanta Practice' },
  library: { ko: '곡 목록', en: 'Library' },
  player: { ko: '연습', en: 'Player' },
  drills: { ko: '암기 훈련', en: 'Drills' },
  progress: { ko: '연습 기록', en: 'Progress' },
  editor: { ko: '악보 편집', en: 'Editor' },
} as const satisfies Record<string, PageName>;
