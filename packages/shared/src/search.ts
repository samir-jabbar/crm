/**
 * Search normalization shared by the client and the server's SQL function `hj_norm` (research R3):
 * decompose (NFKD), drop combining marks (French accents, Arabic harakat), drop the Arabic tatweel,
 * lower-case. Chinese has no case and is matched by plain substring.
 */
const COMBINING_MARKS = /\p{M}/gu;
const TATWEEL = /ـ/g;

export function normalizeForSearch(value: string): string {
  return value.normalize('NFKD').replace(COMBINING_MARKS, '').replace(TATWEEL, '').toLowerCase().trim();
}

/** A LIKE pattern that matches `query` anywhere, with `%`, `_` and `\` taken literally (use `ESCAPE '\'`). */
export function likePattern(query: string): string {
  const escaped = normalizeForSearch(query).replace(/[\\%_]/g, (c) => `\\${c}`);
  return `%${escaped}%`;
}
