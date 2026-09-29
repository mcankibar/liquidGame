// Game tuning. Every value here is read live, so editing it in the Scene Debugger ("🎮 Oyun Ayarları")
// changes the running game; "Ayarları kopyala" there puts the edited object on the clipboard to paste back here.
// Angles are in degrees, distances in world units (a glass is about one unit tall). The bench top is y = 0,
// +z points towards the player, the back wall stands at z = -4.2.

export const defaultGameConfig = {
  components: {
    camera: {
      // true: the camera frames the bench itself on every resize; false: use position / lookAt below.
      autoFrame: true,
      // Auto framing: view direction (x sideways, y up, z towards the player) and the start look point.
      direction: { x: 0, y: 0.6, z: 1.46 },
      landscapeDirection: { x: 0, y: 1.05, z: 1.46 }, // steeper, so front glasses clear the mixer
      lookAt: { x: 0, y: 1, z: 0.3 },
      // Manual camera (autoFrame: false).
      position: { x: 0, y: 6.5, z: 6 },
      // Screen margins for auto framing, in NDC (-1..1). `top` is only a starting guess: it drops
      // further when needed so a tipped glass never covers the goal shelf.
      portrait: { top: 0.3, bottom: -0.8, side: 0.94 },
      landscape: { top: 0.26, bottom: -0.84, side: 0.8 }
    },

    // The beaker everything is poured into.
    mixer: {
      position: { x: 0, y: 0, z: -1.9 },
      scale: 1.35, // size of the beaker; the source glasses carry more liquid when it grows
      // Height of the dashed fill line, as a fraction of the beaker's volume. The level ends when the
      // liquid reaches it, and the source glasses are filled to match.
      fillLevel: 0.6
    },

    // The glasses you tap and pour from, handled as one group standing on an arc. The group is placed
    // on its own: moving the mixer does not move it.
    sources: {
      position: { x: 0, y: 0, z: 0.1 }, // centre of the arc
      arcWidth: 2.66, // half-width of the arc
      arcDepth: 2.0, // how far in front of the centre the arc runs
      spread: 0, // half-angle of the arc in degrees; 0 picks one by glass count
      startFill: 0.72 // most a glass is filled at the start; glasses grow if the fill line needs more
    },

    // The goal glass and the wall shelf it stands on.
    goalShelf: {
      // true: keep the shelf top-centre, just under the HUD card, whatever the screen shape.
      // false: put the glass at `position`.
      autoPlace: true,
      position: { x: 0, y: 2.6, z: -3.45 },
      distanceFromWall: 0.75, // auto placement: how far in front of the wall the glass stands
      glassScalePortrait: 1.5,
      glassScaleLandscape: 1.1,
      shelfWidth: 2.2,
      shelfThickness: 0.07,
      shelfColor: 0x7a4e2a,
      tagGap: 52, // px between the HUD card and the "HEDEF" tag
      tilt: 0, // degrees the glass and shelf lean towards the player, so the liquid shows
      glow: 0 // coloured outline, halo and rune ring around the glass (0 = none)
    },

    pour: {
      hoverTilt: 16, // resting tilt over the mixer after a tap
      maxTilt: 122,
      tiltSpeed: 75, // °/s while held, before liquid reaches the lip
      pourTiltSpeed: 24, // °/s while held and pouring
      travelTime: 0.42, // seconds to fly between the bench and the mixer
      flowGain: 3.2, // how fast liquid above the lip drains (1/s)
      maxFlow: 0.5, // of the goal volume per second
      tiltSpring: 150,
      tiltDamping: 21
    },

    stream: {
      gravity: 22,
      thickness: 1
    },

    liquid: {
      // How much light passes through (0 = opaque paint, 1 = clear coloured water). White pigment
      // stays milky regardless.
      clarity: 0.7,
      // Distance light travels before taking on the full colour: smaller = deeper, richer tint.
      tintDistance: 0.14,
      roughness: 0.04,
      glow: 0.18,
      sparkle: 0.45,
      foamDecay: 0.3,
      swirlDecay: 0.45,
      slosh: 1
    },

    effects: {
      bubbles: true,
      vapor: true,
      sparks: true,
      splash: true,
      vaporRate: 0.7,
      // Vapor and sparks are drawn this many times brighter than white so they bloom; the liquids
      // and glass stay under the bloom threshold and keep their true colours.
      glowStrength: 3
    },

    lighting: {
      exposure: 1.35,
      // Warm key light from above the player's shoulder.
      key: { color: 0xfff6ec, intensity: 3 },
      // Soft light from every side: sky colour from above, ground colour from below.
      // Near-white so pigments keep their true hue; the warmth comes from the wood and stone.
      ambient: { skyColor: 0xffffff, groundColor: 0x8a8580, intensity: 2.4 },
      environment: 1.3, // strength of reflections on glass and liquid
      fill: { color: 0xffffff, intensity: 0.16 },
      rim: { color: 0xfff2e4, intensity: 0.45 }
    },

    bloom: {
      enabled: false, // off for now; turn on from the Scene Debugger to try it
      strength: 0.9,
      threshold: 1, // only light brighter than white (glows, sparks) blooms
      radius: 0.55
    },

    quality: {
      maxDpr: 1.5,
      maxPixels: 2100000
    },

    workshop: {
      dust: true
    },

    audio: {
      enabled: true,
      musicVolume: 0.45,
      effectsVolume: 0.9, // pour, clink, win and lose
      pourVolume: 0.8
    },

    tutorialHand: {
      enabled: true,
      size: 115, // px, width of the hand
      pressDuration: 1.3 // seconds per tap (a hold loop takes twice as long)
    }
  }
};

const V = (min, max, step = 0.01) => ({ min, max, step });
const XYZ = (x, y, z) => ({ x, y, z });

// Slider ranges for the Scene Debugger; anything not listed gets a plain number field.
// A position entry holds one range per axis.
export const gameConfigRanges = {
  "camera.direction": XYZ(V(-1, 1), V(0.1, 2), V(0.1, 2)),
  "camera.landscapeDirection": XYZ(V(-1, 1), V(0.1, 2), V(0.1, 2)),
  "camera.lookAt": XYZ(V(-3, 3), V(-2, 4), V(-4, 4)),
  "camera.position": XYZ(V(-10, 10), V(0, 20), V(-5, 20)),
  "mixer.position": XYZ(V(-3, 3), V(0, 2), V(-3.5, 2)),
  "mixer.scale": V(0.5, 2),
  "mixer.fillLevel": V(0.1, 0.92),
  "sources.position": XYZ(V(-3, 3), V(0, 2), V(-3.5, 2.5)),
  "sources.arcWidth": V(0.6, 3),
  "sources.arcDepth": V(0.8, 3.5),
  "sources.spread": V(0, 80, 1),
  "sources.startFill": V(0.3, 0.85),
  "goalShelf.position": XYZ(V(-4, 4), V(0.5, 6), V(-4.1, 1)),
  "goalShelf.distanceFromWall": V(0.3, 2),
  "goalShelf.glassScalePortrait": V(0.6, 2.5),
  "goalShelf.glassScaleLandscape": V(0.6, 2.5),
  "goalShelf.shelfWidth": V(0.6, 5),
  "goalShelf.shelfThickness": V(0.02, 0.3),
  "goalShelf.tagGap": V(20, 120, 1),
  "goalShelf.tilt": V(0, 40, 1),
  "goalShelf.glow": V(0, 1.5),
  "pour.hoverTilt": V(0, 45, 1),
  "pour.maxTilt": V(60, 160, 1),
  "pour.tiltSpeed": V(10, 200, 1),
  "pour.pourTiltSpeed": V(5, 120, 1),
  "pour.travelTime": V(0.1, 1.5),
  "pour.flowGain": V(0.5, 10, 0.1),
  "pour.maxFlow": V(0.1, 2, 0.05),
  "pour.tiltSpring": V(20, 400, 1),
  "pour.tiltDamping": V(2, 60, 0.5),
  "stream.gravity": V(5, 60, 0.5),
  "stream.thickness": V(0.3, 3, 0.05),
  "liquid.clarity": V(0, 1),
  "liquid.tintDistance": V(0.05, 2),
  "liquid.roughness": V(0, 0.5),
  "liquid.glow": V(0, 1),
  "liquid.sparkle": V(0, 2),
  "liquid.foamDecay": V(0.05, 2),
  "liquid.swirlDecay": V(0.05, 2),
  "liquid.slosh": V(0, 3, 0.05),
  "effects.vaporRate": V(0, 3, 0.05),
  "effects.glowStrength": V(0, 6, 0.1),
  "lighting.exposure": V(0.3, 2.5),
  "lighting.key.intensity": V(0, 6, 0.05),
  "lighting.ambient.intensity": V(0, 5, 0.05),
  "lighting.environment": V(0, 3, 0.05),
  "lighting.fill.intensity": V(0, 3),
  "lighting.rim.intensity": V(0, 3),
  "bloom.strength": V(0, 3, 0.05),
  "bloom.threshold": V(0, 1.5),
  "bloom.radius": V(0, 1, 0.05),
  "quality.maxDpr": V(0.5, 3, 0.05),
  "quality.maxPixels": V(300000, 8000000, 100000),
  "audio.musicVolume": V(0, 1),
  "audio.effectsVolume": V(0, 1.5),
  "audio.pourVolume": V(0, 2),
  "tutorialHand.size": V(40, 200, 1),
  "tutorialHand.pressDuration": V(0.6, 4, 0.05)
};

// Names shown in the Scene Debugger.
export const gameConfigLabels = {
  camera: "📷 Kamera",
  "camera.autoFrame": "Otomatik kadraj",
  "camera.direction": "Bakış yönü (dikey)",
  "camera.landscapeDirection": "Bakış yönü (yatay)",
  "camera.lookAt": "Bakılan nokta",
  "camera.position": "Konum (elle)",
  "camera.portrait": "Dikey ekran payları",
  "camera.landscape": "Yatay ekran payları",
  "camera.portrait.top": "Üst",
  "camera.portrait.bottom": "Alt",
  "camera.portrait.side": "Yan",
  "camera.landscape.top": "Üst",
  "camera.landscape.bottom": "Alt",
  "camera.landscape.side": "Yan",

  mixer: "🧪 Karıştırma beheri",
  "mixer.position": "Konum",
  "mixer.scale": "Boyut",
  "mixer.fillLevel": "Doldurma seviyesi",

  sources: "🥛 Dökülen bardaklar (grup)",
  "sources.position": "Grup konumu (dizilim merkezi)",
  "sources.arcWidth": "Dizilim genişliği",
  "sources.arcDepth": "Merkezden öne uzaklık",
  "sources.spread": "Dizilim açısı (0=oto)",
  "sources.startFill": "Başlangıç doluluğu",

  goalShelf: "🎯 Hedef bardak ve rafı",
  "goalShelf.autoPlace": "Otomatik yerleştir",
  "goalShelf.position": "Konum (elle)",
  "goalShelf.distanceFromWall": "Duvara uzaklık",
  "goalShelf.glassScalePortrait": "Bardak boyu (dikey)",
  "goalShelf.glassScaleLandscape": "Bardak boyu (yatay)",
  "goalShelf.shelfWidth": "Raf genişliği",
  "goalShelf.shelfThickness": "Raf kalınlığı",
  "goalShelf.shelfColor": "Raf rengi",
  "goalShelf.tagGap": "Etiket boşluğu (px)",
  "goalShelf.tilt": "Öne eğim (°)",
  "goalShelf.glow": "Parıltı / dış çizgi",

  pour: "🫗 Döküş",
  "pour.hoverTilt": "Bekleme eğimi (°)",
  "pour.maxTilt": "En fazla eğim (°)",
  "pour.tiltSpeed": "Eğilme hızı (°/sn)",
  "pour.pourTiltSpeed": "Dökerken eğilme hızı",
  "pour.travelTime": "Uçuş süresi (sn)",
  "pour.flowGain": "Akış hızı",
  "pour.maxFlow": "En fazla akış",
  "pour.tiltSpring": "Eğim yayı",
  "pour.tiltDamping": "Eğim sönümü",

  stream: "💧 Sıvı akışı",
  "stream.gravity": "Yerçekimi",
  "stream.thickness": "Akış kalınlığı",

  liquid: "🌊 Sıvı görünümü",
  "liquid.clarity": "Berraklık",
  "liquid.tintDistance": "Renk derinliği",
  "liquid.roughness": "Pürüz",
  "liquid.glow": "Işıltı",
  "liquid.sparkle": "Parıltılar",
  "liquid.foamDecay": "Köpük sönme hızı",
  "liquid.swirlDecay": "Girdap sönme hızı",
  "liquid.slosh": "Çalkalanma",

  effects: "✨ Efektler",
  "effects.bubbles": "Kabarcıklar",
  "effects.vapor": "Buhar",
  "effects.sparks": "Kıvılcımlar",
  "effects.splash": "Sıçrama damlaları",
  "effects.vaporRate": "Buhar yoğunluğu",
  "effects.glowStrength": "Buhar/kıvılcım parlaklığı",

  lighting: "💡 Işık",
  "lighting.exposure": "Pozlama",
  "lighting.key": "Ana ışık",
  "lighting.key.color": "Renk",
  "lighting.key.intensity": "Şiddet",
  "lighting.ambient": "Ortam ışığı",
  "lighting.ambient.skyColor": "Üst renk",
  "lighting.ambient.groundColor": "Alt renk",
  "lighting.ambient.intensity": "Şiddet",
  "lighting.environment": "Yansıma şiddeti",
  "lighting.fill": "Dolgu ışığı",
  "lighting.rim": "Arka ışık",
  "lighting.fill.color": "Renk",
  "lighting.fill.intensity": "Şiddet",
  "lighting.rim.color": "Renk",
  "lighting.rim.intensity": "Şiddet",

  bloom: "🌟 Parlama (bloom)",
  "bloom.enabled": "Açık",
  "bloom.strength": "Güç",
  "bloom.threshold": "Eşik",
  "bloom.radius": "Yayılma",

  quality: "⚡ Performans",
  "quality.maxDpr": "En yüksek piksel oranı",
  "quality.maxPixels": "Piksel bütçesi",

  workshop: "📜 Atölye",
  "workshop.dust": "Toz zerrecikleri",

  audio: "🔊 Ses",
  "audio.enabled": "Açık",
  "audio.musicVolume": "Müzik sesi",
  "audio.effectsVolume": "Efekt sesi",
  "audio.pourVolume": "Dökülme sesi",

  tutorialHand: "👆 Öğretici el",
  "tutorialHand.enabled": "Açık",
  "tutorialHand.size": "Boyut (px)",
  "tutorialHand.pressDuration": "Animasyon süresi (sn)"
};
