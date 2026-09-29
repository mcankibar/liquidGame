import { matchPercent, mixRgb } from "./mix.js";
import { PASS_PERCENT } from "./levels.js";

export function createSession(levels) {
  return { levels, index: 0, result: null };
}

export function levelOf(session) {
  return session.levels[session.index];
}

export function targetRgb(session) {
  return mixRgb(levelOf(session).target);
}

export function starsFor(percent) {
  if (percent >= 95) return 3;
  if (percent >= 90) return 2;
  if (percent >= PASS_PERCENT) return 1;
  return 0;
}

export function finish(session, mix) {
  const percent = matchPercent(levelOf(session).target, mix);
  session.result = {
    percent,
    stars: starsFor(percent),
    pass: percent >= PASS_PERCENT,
    rgb: mixRgb(mix),
    last: session.index === session.levels.length - 1
  };
  return session.result;
}

export function retry(session) {
  session.result = null;
}

export function nextLevel(session) {
  if (!session.result?.pass) return false;
  session.index = (session.index + 1) % session.levels.length;
  session.result = null;
  return true;
}
