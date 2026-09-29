import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import _ from "lodash-es";
import { GameClock } from "../playable/kit/lifecycle.js";
import { scheduleLoad, assetLoadHandler } from "../lib/playinFramework3D/components/loaders/loaderUtils.js";
import { getNetworkSettings, MraidHandler, DapiHandler } from "../playable/kit/networks.js";
import { EXPORT_NETWORKS } from "../playable/export/networks.js";
import { EventBus } from "../lib/playinFramework3D/modules/EventBus.js";

const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

test("game time, timers and independent pause reasons", () => {
  const states = [];
  const clock = new GameClock((p) => states.push(p));
  let fired = 0;
  clock.schedule(() => fired++, 1000);
  clock.tick(0);
  clock.tick(500);
  clock.setPaused("sdk", true);
  clock.setPaused("document", true);
  clock.tick(2000);
  clock.setPaused("sdk", false);
  clock.tick(3000);
  assert.equal(clock.time, 500);
  clock.setPaused("document", false);
  clock.tick(4000);
  clock.tick(4500);
  assert.equal(fired, 1);
  assert.deepEqual(states, [true, false]);
});

test("shared assets load once and every subscriber waits for all dependencies", async () => {
  const loaded = new Map(),
    sent = new Set(),
    pendingA = new Set(),
    pendingB = new Set(),
    finishes = {};
  let requests = 0,
    readyA = 0,
    readyB = 0;
  for (const [pending, ready] of [
    [pendingA, () => readyA++],
    [pendingB, () => readyB++]
  ]) {
    for (const key of ["a", "b"]) {
      const finish = (k, error) => assetLoadHandler(k, pending, sent, ready, error);
      scheduleLoad(
        key,
        loaded,
        sent,
        pending,
        () => {
          requests++;
          finishes[key] = () => {
            loaded.set(key, true);
            finish(key);
          };
        },
        finish
      );
    }
  }
  await flush();
  assert.equal(requests, 2);
  finishes.a();
  await flush();
  assert.equal(readyA + readyB, 0);
  finishes.b();
  await flush();
  assert.equal(readyA, 1);
  assert.equal(readyB, 1);
});

test("failed shared requests reach all subscribers and can be retried", async () => {
  const loaded = new Map(),
    sent = new Set();
  let failures = 0;
  for (let i = 0; i < 2; i++) {
    const pending = new Set();
    scheduleLoad(
      "broken",
      loaded,
      sent,
      pending,
      () => {
        throw new Error("broken");
      },
      (key, error) =>
        assetLoadHandler(
          key,
          pending,
          sent,
          () => assert.fail("must not be ready"),
          error,
          () => failures++
        )
    );
  }
  await flush();
  assert.equal(failures, 2);
  assert.equal(sent.size, 0);
});

test("AppGrowth false viewability remains false", () => {
  let handler;
  let event;
  const context = {
    window: {
      innerWidth: 100,
      innerHeight: 100,
      self: {},
      top: {},
      parent: { postMessage() {} },
      addEventListener: (type, fn) => {
        handler = fn;
      }
    },
    document: {},
    console
  };
  vm.createContext(context);
  vm.runInContext(EXPORT_NETWORKS.appgrowth.head.match(/<script>([\s\S]*?)<\/script>/)[1], context);
  context.dapi.addEventListener("viewableChange", (v) => {
    event = v;
  });
  handler({ data: JSON.stringify({ name: "viewableChange", value: false }) });
  assert.equal(context.dapi.isViewable(), false);
  assert.equal(event.isViewable, false);
});

test("TikTok invokes documented CTA, Mintegral readiness waits for the ready hook", () => {
  let clicks = 0,
    ready = 0;
  globalThis.window = {
    openAppStore: () => clicks++,
    gameReady: () => ready++
  };
  getNetworkSettings("tiktok").handleOpenStore("unused");
  assert.equal(clicks, 1);
  assert.equal(getNetworkSettings("mintegral").onPlayableStarted, undefined);
  getNetworkSettings("mintegral").onPlayableReady();
  assert.equal(ready, 1);
  delete globalThis.window;
});

test("endcard is idempotent under synchronous event re-entry", () => {
  const source = fs
    .readFileSync("lib/playinFramework3D/modules/playable.js", "utf8")
    .replace(/^import .*;$/gm, "")
    .replace("export class Playable", "globalThis.Playable = class Playable");
  const context = { _, GameClock, FINISHED_EVENT: "finished" };
  vm.createContext(context);
  vm.runInContext(source, context);
  const playable = Object.create(context.Playable.prototype);
  let ended = 0,
    rendered = 0;
  playable.props = {
    options: { isEndCardEnabled: true, endCardDelay: 0 },
    components: new Map([["end", { type: "endCard", condition: "won", render: () => rendered++ }]])
  };
  playable.helper = { isEndCardShown: false };
  playable.clock = new GameClock();
  playable.eventBus = new EventBus();
  playable.adNetworkSettings = { onPlayableEnd: () => ended++ };
  playable.eventBus.on("finished", () => playable.playableEnd(false));
  playable.playableEnd();
  playable.playableEnd();
  playable.clock.tick(0);
  assert.equal(ended, 1);
  assert.equal(rendered, 1);
});

test("published runtime ignores preview state and does not install a message listener", async () => {
  let listeners = 0,
    reloads = 0;
  globalThis.window = {
    __PL_MODE__: "publish",
    name: 'pl-preview:{"overrides":{"options.isSoundEnabled":false}}',
    addEventListener: () => listeners++,
    location: { reload: () => reloads++ }
  };
  globalThis.document = {
    getElementById: () => null,
    querySelectorAll: () => []
  };
  const { createRuntime, readPreviewState, applyPreview } = await import("../playable/kit/runtime.js");
  const { bool } = await import("../playable/kit/fields.js");
  const runtime = createRuntime({ options: { isSoundEnabled: bool(true) } });
  assert.equal(runtime.config.options.isSoundEnabled, true);
  assert.equal(readPreviewState(), null);
  applyPreview({});
  assert.equal(listeners, 0);
  assert.equal(reloads, 0);
  delete globalThis.window;
  delete globalThis.document;
});

test("preview bridge checks parent and origin before applying overrides", async () => {
  let listener,
    reloads = 0;
  const parent = {};
  globalThis.window = {
    __PL_MODE__: "preview",
    name: "",
    parent,
    addEventListener: (type, fn) => {
      listener = fn;
    },
    location: { origin: "http://localhost:4173", reload: () => reloads++ }
  };
  parent.postMessage = () => {};
  globalThis.document = {
    getElementById: () => null,
    querySelectorAll: () => []
  };
  const { createRuntime } = await import("../playable/kit/runtime.js?bridge-test");
  const { num } = await import("../playable/kit/fields.js");
  createRuntime({ options: { a: num(0) } });
  // No live handler is registered, so an accepted preview restarts the page.
  const data = { type: "pl:preview", overrides: { "options.a": 1 } };
  listener({ data, source: {}, origin: "http://localhost:4173" });
  listener({ data, source: parent, origin: "https://other.example" });
  assert.equal(reloads, 0);
  listener({ data, source: parent, origin: "http://localhost:4173" });
  assert.equal(reloads, 1);
  window.__PL_PREVIEW_TOKEN__ = "test-session-123456789";
  listener({ data, source: parent, origin: "http://localhost:4173" });
  assert.equal(reloads, 1);
  listener({
    data: { ...data, token: window.__PL_PREVIEW_TOKEN__ },
    source: parent,
    origin: "null"
  });
  assert.equal(reloads, 2);
  delete globalThis.window;
  delete globalThis.document;
});

test("preview changes apply live unless a changed field needs a restart", async () => {
  let listener,
    reloads = 0;
  const parent = { postMessage() {} };
  globalThis.window = {
    __PL_MODE__: "preview",
    name: "",
    parent,
    addEventListener: (type, fn) => (listener = fn),
    location: { origin: "http://localhost:4173", reload: () => reloads++ }
  };
  globalThis.document = { getElementById: () => null, querySelectorAll: () => [] };
  const { createRuntime, onLiveUpdate, updatePreview } = await import("../playable/kit/runtime.js?live-test");
  const { num, text, language } = await import("../playable/kit/fields.js");
  createRuntime({
    components: { cta: { scale: num(1), level: text("1,2", { restart: true }) } },
    options: { language: language("auto") }
  });
  const updates = [];
  onLiveUpdate((update) => updates.push(update));

  updatePreview({ "components.cta.scale": 2 });
  assert.equal(reloads, 0);
  assert.deepEqual(updates[0].changed, ["components.cta.scale"]);
  assert.equal(updates[0].config.components.cta.scale, 2);
  // Same values again: nothing to do.
  updatePreview({ "components.cta.scale": 2 });
  assert.equal(updates.length, 1);
  // Values are kept for a later restart.
  assert.match(window.name, /components\.cta\.scale/);

  updatePreview({ "components.cta.scale": 2, "components.cta.level": "3,4" });
  assert.equal(reloads, 1);
  assert.equal(updates.length, 1);

  // A handler that cannot apply the change falls back to a restart.
  onLiveUpdate(() => false);
  updatePreview({ "components.cta.scale": 3 });
  assert.equal(reloads, 2);
  assert.equal(typeof listener, "function");
  delete globalThis.window;
  delete globalThis.document;
});

test("MRAID and DAPI hidden-to-visible lifecycle pauses then loads", () => {
  const events = {};
  const calls = [];
  globalThis.window = { innerWidth: 320, innerHeight: 480 };
  const playable = {
    isGamePlayable: false,
    pauseGame: (r) => calls.push(`pause:${r}`),
    resumeGame: (r) => calls.push(`resume:${r}`),
    loadGame: () => calls.push("load"),
    muteGame() {},
    unmuteGame() {}
  };
  globalThis.mraid = {
    addEventListener: (key, cb) => (events[key] = cb),
    getState: () => "default",
    isViewable: () => false,
    getMaxSize: () => ({ width: 320, height: 480 })
  };
  new MraidHandler(playable).initialize();
  assert.ok(calls.includes("pause:sdk"));
  assert.ok(!calls.includes("load"));
  events.viewableChange(true);
  assert.equal(calls.at(-1), "load");
  calls.length = 0;
  globalThis.dapi = {
    addEventListener: (key, cb) => (events[key] = cb),
    isReady: () => true,
    isViewable: () => false
  };
  new DapiHandler(playable).initialize();
  assert.ok(calls.includes("pause:sdk"));
  assert.ok(!calls.includes("load"));
  events.viewableChange({ isViewable: true });
  assert.equal(calls.at(-1), "load");
  delete globalThis.window;
  delete globalThis.mraid;
  delete globalThis.dapi;
});

test("bot distinguishes a completed smoke check from a game that never becomes ready", async () => {
  const listeners = {};
  const messages = [];
  let tick;
  const interval = globalThis.setInterval;
  const clear = globalThis.clearInterval;
  const error = console.error;
  const parent = { postMessage: (m) => messages.push(m) };
  globalThis.window = {
    __PL_MODE__: "preview",
    parent,
    name: "",
    location: { origin: "http://localhost" },
    addEventListener: (type, fn) => {
      listeners[type] = fn;
    }
  };
  globalThis.document = { getElementById: () => null, querySelectorAll: () => [] };
  globalThis.setInterval = (fn) => {
    tick = fn;
    return 1;
  };
  globalThis.clearInterval = () => {};
  try {
    const runtime = await import("../playable/kit/runtime.js?bot-check-regression");
    runtime.createRuntime({});
    let steps = 0;
    runtime.registerBot({ status: () => ({ state: "ready" }), moves: () => [{}], play: () => steps++ });
    listeners.message({
      source: parent,
      origin: "http://localhost",
      data: { type: "pl:bot", mode: "check", maxSteps: 2 }
    });
    tick();
    tick();
    tick();
    assert.equal(steps, 2);
    assert.equal(messages.at(-1).outcome, "checked");
    runtime.registerBot({ status: () => ({ state: "busy" }), moves: () => [], play: () => {} });
    listeners.message({
      source: parent,
      origin: "http://localhost",
      data: { type: "pl:bot", mode: "check", timeoutMs: -1 }
    });
    tick();
    assert.equal(messages.at(-1).outcome, "timeout");
    assert.equal(messages.at(-1).steps, 0);
  } finally {
    globalThis.setInterval = interval;
    globalThis.clearInterval = clear;
    console.error = error;
    delete globalThis.window;
    delete globalThis.document;
  }
});
