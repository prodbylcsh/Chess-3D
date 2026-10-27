// How long the player is away from a matchmade game during each of their turns: another tab,
// another app or another window in front. Sent with the game's engine analysis; the server
// counts the moves made after leaving (supabase/functions/_shared/fairplay.ts, fair play).

const isAway = () => document.hidden || !document.hasFocus();

export class AwayTracker {
  private readonly ms: number[] = [];
  /** the ply of the player's turn now, or null while it is not their turn */
  private ply: number | null = null;
  /** when the player left during this turn */
  private since: number | null = null;
  private readonly update = () => this.check();

  constructor() {
    document.addEventListener('visibilitychange', this.update);
    window.addEventListener('blur', this.update);
    window.addEventListener('focus', this.update);
  }

  /** The player's turn at this ply has started, or (null) their turn is over. */
  turn(ply: number | null): void {
    if (ply === this.ply) return;
    this.close();
    this.ply = ply;
    this.check();
  }

  /** Away time per ply (ms) for a game of `plies` plies. */
  values(plies: number): number[] {
    this.close();
    return Array.from({ length: plies }, (_, i) => Math.round(this.ms[i] ?? 0));
  }

  dispose(): void {
    document.removeEventListener('visibilitychange', this.update);
    window.removeEventListener('blur', this.update);
    window.removeEventListener('focus', this.update);
  }

  private check(): void {
    if (this.ply === null) return;
    if (isAway()) this.since ??= performance.now();
    else this.close();
  }

  private close(): void {
    if (this.ply !== null && this.since !== null) this.ms[this.ply] = (this.ms[this.ply] ?? 0) + performance.now() - this.since;
    this.since = null;
  }
}
