// Game time advances only while visible/started. Timers share the same pause contract.
export class GameClock {
  constructor(onPause = () => {}) {
    this.reasons = new Set();
    this.time = 0;
    this.last = null;
    this.timers = new Set();
    this.onPause = onPause;
  }
  get paused() {
    return this.reasons.size > 0;
  }
  setPaused(reason, paused) {
    if (this.reasons.has(reason) === paused) return;
    const before = this.paused;
    if (paused) this.reasons.add(reason);
    else this.reasons.delete(reason);
    this.last = null;
    if (before !== this.paused) this.onPause(this.paused);
  }
  schedule(callback, delayMs) {
    const timer = { at: this.time + delayMs, callback };
    this.timers.add(timer);
    return timer;
  }
  cancel(timer) {
    this.timers.delete(timer);
  }
  tick(now) {
    const delta = this.last === null ? 0 : Math.max(0, now - this.last);
    this.last = now;
    if (this.paused) return;
    this.time += delta;
    for (const timer of [...this.timers]) {
      if (timer.at <= this.time && this.timers.delete(timer)) timer.callback();
    }
  }
}
