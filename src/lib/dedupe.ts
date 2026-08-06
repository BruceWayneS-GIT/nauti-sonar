/**
 * Loose identity key for an article headline: lowercase, punctuation reduced
 * to spaces, whitespace collapsed. Makes "Google buys 'smart' thermostat maker
 * Nest for $3.2 bn" and "Google buys smart thermostat maker Nest for 3 2 bn"
 * resolve to the same key.
 *
 * Capped at 255 chars to fit an indexed VarChar column.
 */
export function titleKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .slice(0, 255);
}

/** Statuses meaning a human has worked this article — never lose one of these. */
const ACTIONED = new Set(['REVIEWING', 'READY', 'SENT', 'COMPLETED']);

export interface KeeperCandidate {
  id: string;
  status: string;
  contactEmail: string | null;
  createdAt: Date;
}

/**
 * Rank a candidate: worked-on beats live, live beats already-archived.
 *
 * The archived tier matters. Without it an older archived copy outranks a
 * newer live one, becomes the keeper, and every active article gets archived
 * around it — leaving the lead with nothing in the pipeline at all.
 */
function statusRank(status: string): number {
  if (ACTIONED.has(status)) return 2;
  if (status === 'ARCHIVED') return 0;
  return 1;
}

/**
 * Of a set of duplicates, decide which to keep: actioned articles win, then
 * live ones over archived, then ones carrying a contact email, then the
 * oldest. Ensures outreach work is never discarded in favour of an untouched
 * row, and that a group always keeps something visible.
 */
export function pickKeeper<T extends KeeperCandidate>(rows: T[]): T {
  return [...rows].sort((a, b) => {
    const rank = statusRank(b.status) - statusRank(a.status);
    if (rank !== 0) return rank;

    const aEmail = a.contactEmail ? 1 : 0;
    const bEmail = b.contactEmail ? 1 : 0;
    if (aEmail !== bEmail) return bEmail - aEmail;

    return a.createdAt.getTime() - b.createdAt.getTime();
  })[0];
}
