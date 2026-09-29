import "./hud.css";

import { defaultGameConfig } from "../gameConfig/defaultGameConfig.js";

const handConfig = defaultGameConfig.components.tutorialHand;

// Fingertip inside tutorialHand.png, as a fraction of its width / height, and its height / width.
// The hand points up and to the right, so it rests below-left of what it taps.
const TIP = { x: 0.955, y: 0.03 };
const HAND_ASPECT = 420 / 349;

/** `handImage` is the resolved asset entry of params.components.tutorialHand.assets.hand. */
export function mountHud(actions, handImage) {
  const root = document.createElement("div");
  root.id = "pigment-hud";
  root.innerHTML = `
    <header class="target-card">
      <div class="target-text">
        <p class="eyebrow">Hedef renk <span id="pg-level"></span></p>
        <h1 id="pg-name"></h1>
        <div class="meter">
          <div class="meter-track"><div class="meter-fill" id="pg-fill"></div></div>
          <span class="meter-value" id="pg-match">—</span>
        </div>
      </div>
      <button type="button" class="retry-button" id="pg-retry" aria-label="Baştan başla">↻</button>
    </header>
    <p class="hint" id="pg-hint">Bir bardağa dokun, basılı tutarak dök</p>
    <div class="guide" id="pg-guide" hidden>
      <img class="guide-hand" id="pg-hand" alt="" draggable="false" />
      <div class="guide-hold"><span>Basılı tut</span><i><b></b></i></div>
    </div>
    <div class="target-tag" id="pg-tag" hidden><span id="pg-tag-dot"></span>Hedef renk</div>
    <section class="result" id="pg-result" hidden>
      <div class="result-card">
        <div class="result-score">
          <div class="stars" id="pg-stars"><i></i><i></i><i></i></div>
          <p class="result-percent" id="pg-percent"></p>
          <p class="result-title" id="pg-verdict"></p>
        </div>
        <div class="result-actions">
          <div class="compare">
            <figure><span id="pg-want"></span><figcaption>Hedef</figcaption></figure>
            <figure><span id="pg-got"></span><figcaption>Senin</figcaption></figure>
          </div>
          <button type="button" class="primary" id="pg-next"></button>
        </div>
      </div>
    </section>
  `;
  document.body.appendChild(root);
  const $ = (id) => root.querySelector(`#${id}`);

  const tag = $("pg-tag");
  const card = root.querySelector(".target-card");
  const fill = $("pg-fill");
  const match = $("pg-match");
  const hint = $("pg-hint");
  const guide = $("pg-guide");
  const hand = $("pg-hand");
  if (handImage) hand.src = handImage.data || `./assets/${handImage.assetPath}`;
  const result = $("pg-result");
  const next = $("pg-next");
  let resultPass = false;

  $("pg-retry").addEventListener("click", actions.onRetry);
  next.addEventListener("click", () => (resultPass ? actions.onNext() : actions.onRetry()));

  return {
    setTarget({ name, hex, index, count }) {
      $("pg-name").textContent = name;
      $("pg-level").textContent = `· ${index + 1}/${count}`;
      $("pg-tag-dot").style.background = hex;
      match.textContent = "—";
      fill.style.width = "0%";
      hint.classList.remove("is-hidden");
    },
    setProgress({ fill: amount, percent }) {
      fill.style.width = `${Math.round(amount * 100)}%`;
      match.textContent = percent === null ? "—" : `%${percent}`;
      if (amount > 0.02) hint.classList.add("is-hidden");
    },
    cardBottom() {
      return card.getBoundingClientRect().bottom;
    },
    setTag(point) {
      tag.hidden = !point;
      if (!point) return;
      // Never let the bobbing pill ride up onto the target card.
      const y = Math.max(point.y, card.getBoundingClientRect().bottom + 46);
      tag.style.transform = `translate(${Math.round(point.x)}px, ${Math.round(y)}px)`;
    },
    setGuide(point) {
      const wasHidden = guide.hidden;
      guide.hidden = !point || !handImage || !handConfig.enabled;
      if (guide.hidden) return;
      const { size, pressDuration } = handConfig;
      guide.style.transform = `translate(${Math.round(point.x)}px, ${Math.round(point.y)}px)`;
      guide.style.setProperty("--hand-size", `${size}px`);
      guide.style.setProperty("--tip-x", `${-TIP.x * size}px`);
      guide.style.setProperty("--tip-y", `${-TIP.y * size * HAND_ASPECT}px`);
      guide.style.setProperty("--press", `${pressDuration}s`);
      const hold = !!point.hold;
      if (wasHidden || hold !== guide.classList.contains("is-hold")) {
        // Restart the animation so the hand appears on the glass instead of mid-press.
        guide.classList.toggle("is-hold", hold);
        hand.style.animation = "none";
        void hand.offsetWidth;
        hand.style.animation = "";
      }
    },
    showResult(outcome, wantHex, gotHex) {
      resultPass = outcome.pass;
      root.querySelectorAll("#pg-stars i").forEach((star, i) => star.classList.toggle("is-on", i < outcome.stars));
      $("pg-percent").textContent = `%${outcome.percent}`;
      $("pg-verdict").textContent = outcome.pass
        ? outcome.stars === 3
          ? "Kusursuz karışım!"
          : outcome.stars === 2
          ? "Harika!"
          : "Oldu!"
        : "Biraz uzak kaldı";
      $("pg-want").style.background = wantHex;
      $("pg-got").style.background = gotHex;
      next.textContent = outcome.pass ? (outcome.last ? "Baştan oyna" : "Sonraki renk") : "Tekrar dene";
      result.classList.toggle("is-fail", !outcome.pass);
      result.hidden = false;
    },
    hideResult() {
      result.hidden = true;
    }
  };
}
