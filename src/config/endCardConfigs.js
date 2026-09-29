/**
 * END_CARD_LAYOUT
 *
 * Each object defines one End Card. setupEndCards() iterates this array with forEach.
 * Only component ids live here — every setting and asset of these components is declared in
 * src/params.js.
 *
 * logoIds → any number of logos can be added
 * ctaIds  → any number of CTA buttons can be added
 */
export const END_CARD_LAYOUT = [
  // ─── End Card 1 (lost) ────────────────────────────────────────────────────
  {
    endCardId: "endCard1",
    dimmerId: "dimmer2",
    logoIds: ["logo1", "logo2"],
    ctaIds: ["ctaButton2"],
    handId: "tutorialHand2",
    backgroundId: "endCardBackground1",
    roundedTextBoxId: "roundedTextBox2"
  },

  // ─── End Card 2 (won) ─────────────────────────────────────────────────────
  {
    endCardId: "endCard2",
    dimmerId: "dimmer3",
    logoIds: ["logo3", "logo4"],
    ctaIds: ["ctaButton3"],
    handId: "tutorialHand3",
    backgroundId: "endCardBackground2",
    roundedTextBoxId: "roundedTextBox3"
  }
];
