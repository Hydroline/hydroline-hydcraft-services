export const RANK_SORT_FIELDS = [
  'lastLogin',
  'registered',
  'walkDistance',
  'flyDistance',
  'swimDistance',
  'achievements',
  'deaths',
  'playerKilledBy',
  'jumpCount',
  'playTime',
  'wandUses',
  'logoutCount',
  'mtrBalance',
] as const;

export type RankSortField = (typeof RANK_SORT_FIELDS)[number];

export const RANK_STAT_KEYS = [
  'minecraft:custom:minecraft:walk_one_cm',
  'minecraft:custom:minecraft:fly_one_cm',
  'minecraft:custom:minecraft:swim_one_cm',
  'minecraft:custom:minecraft:player_kills',
  'minecraft:custom:minecraft:deaths',
  'minecraft:killed_by:minecraft:player',
  'minecraft:custom:minecraft:jump',
  'minecraft:custom:minecraft:total_world_time',
  'minecraft:custom:minecraft:play_time',
  'minecraft:custom:minecraft:use_wand',
  'minecraft:custom:minecraft:leave_game',
] as const;

export const RANK_DEFAULT_PAGE_SIZE = 20;
export const RANK_MAX_PAGE_SIZE = 40;
export const RANK_CHUNK_SIZE = 180;
export const RANK_SORT_DEFAULT_FIELD: RankSortField = 'walkDistance';
