# ThreeJS Playable Template (Vite, yamanabilir build)

Oyun **bir kez** build edilir. Varyantlar (metin, renk, sayı, görsel/ses değişiklikleri), diller ve reklam ağları
build'e dokunmadan, HTML içindeki veri blokları değiştirilerek üretilir.

```bash
npm install
npm run dev          # http://localhost:5173 — sol alttaki "⚙ Params" paneli ile alanları dene
npm run build        # dist/index.html (tek dosya "release") + dist/manifest.json
npm run export -- --variant=variants/example-tr.json --networks=applovin,unity --langs=en,tr
npm run export:all   # tüm ağlar, varyantsız
npm run release      # build + Playable Studio'ya yükle (.env.local: PLAYABLE_STUDIO, PLAYABLE_STUDIO_TOKEN)
npm run release -- --notes "yeni CTA"
```

## Neden bu yapı? (Playable Studio)

Bu template, ekip içinde kullanılacak küçük bir **Playable Studio** için tasarlandı. Amaç: developer'ın yaptığı
playable'ın en güncel haline ekipteki herkesin (artist, UA, PM) tarayıcıdan erişmesi, kod bilmeden varyant
denemesi, bunları kaydetmesi ve ağ × dil için export alması.

**Eski düzendeki sorun.** Playin Dashboard'da bir oyun birkaç ayrı yerde elle tanımlanıyordu: oyunun config
dosyası, base JSON'u, yüzlerce predefined component JSON'u ve asset map'leri. Export için sunucu oyunun npm
paketine dosya kopyalayıp webpack çalıştırıyordu. Yeni bir oyun eklemek npm publish, veritabanı kaydı, JSON
dosyaları, MR ve deploy demekti. Bu tanımlar kolayca birbirinden kopuyor, export'lar yavaş ve kırılgan oluyordu.

**Bu template'in çözümü:**

- **Tek kaynak `src/params.js`.** Düzenlenebilir alanlar bir kez, oyunun kodunun yanında tanımlanır. Editör formu,
  doğrulama ve export bu dosyadan otomatik türer; elle şema ya da predefined JSON yazılmaz.
- **Bir kez build, sonra yama.** Developer oyunu bir kez build edip release olarak verir. Release HTML'i
  adreslenebilir veri blokları (`<!--pl:...-->`) içerir. Varyant export'u bu blokların metin olarak
  değiştirilmesidir: sunucuda Node/webpack build'i, git ya da `node_modules` gerekmez ve export saniyenin
  altında sürer. Aynı release ile aynı varyant her zaman aynı çıktıyı verir.
- **Varyant küçük bir diff'tir.** Varyant, release'e değil alan yollarına bağlı seyrek bir override listesidir.
  Developer yeni release çıkardığında ekip değişikliklerini yeniden yapmaz; override'lar yeni release'e
  otomatik uygulanır. Yeniden adlandırılan alanlar `was` ile taşınır; silinen alanlar "yetim" olarak
  raporlanır, export'u bozmaz.
- **Oyunda editör kodu yok.** Önizleme `postMessage` ile yeni değerleri gönderip oyunu yeniden başlatır. Final
  export `publish` modundadır ve önizleme mesajlarını yok sayar.

**Planlanan Studio (henüz yazılmadı).** Şirket içinde çalışan küçük bir Node sunucusu (Fastify + SQLite).
Public değildir: ofisteki bir makinede ya da Tailscale üzerinden çalışır; domain, SSL veya bulut gerekmez.

- SQLite yalnızca metadata tutar: oyunlar, release'ler, varyantlar ve revizyonları, export kayıtları.
- Görseller, sesler ve release HTML'leri diskte içerik hash'iyle (sha256) saklanır. Aynı dosya bir kez tutulur.
- Arayüz release'ten okuduğu manifest ile formu otomatik üretir; önizlemeyi iframe'de gösterir.
- Export için bu repodaki exporter modülü (`playable/export/`) kullanılır.

Bu yüzden Studio'dan bağımsız olarak her şey şimdiden lokalde çalışır. Dev paneli varyantı düzenler,
`npm run export` de aynı işi CLI'dan yapar.

## Nasıl çalışır

| Dosya                    | Görev                                                                                                                                                                                         |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/params.js`          | **Tek kaynak.** Oyunun tüm config'i. `num/bool/color/text/image/...` ile sarılan değerler düzenlenebilir, düz değerler sabit. Asset'ler kullanan component'in içinde `assets: {...}` altında. |
| `playable/kit/`          | Tarayıcı runtime'ı: `params.js` + HTML'deki bloklar → `gameConfig`; ağ (store açma, MRAID/DAPI); önizleme köprüsü.                                                                            |
| `playable/build/`        | Vite eklentisi: tek HTML + manifest üretir.                                                                                                                                                   |
| `playable/export/`       | Exporter: release + varyant → ağ/dil dosyaları (build yok, saf metin işlemi).                                                                                                                 |
| `playable/dev/panel.js`  | Sadece `npm run dev`'de açılan parametre paneli.                                                                                                                                              |
| `lib/playinFramework3D/` | Mevcut component framework'ü (config/asset girişi kit'e bağlandı).                                                                                                                            |

Build çıktısındaki bloklar:

```html
<!--pl:network-->  window.__PL_NETWORK__ = "default"          ← export'ta ağ adı yazılır
<!--pl:manifest--> düzenlenebilir alanların şeması              ← Studio/panel okur, export'ta silinir
<!--pl:config-->   { "yol": değer }  override'lar               ← varyant buraya yazılır
<!--pl:assets-->   <script data-pl-asset="logo.png">base64      ← değiştirilir / kapalıysa 1x1'e indirilir
<!--pl:game-->     oyun kodu (IIFE)
```

## Alan tanımlama (`src/params.js`)

```js
ctaButton1: group("In-game CTA", {
  componentType: "orthographic", // sabit
  position: pos(0.75, 0.05, 0.85, 0.1), // portrait x/y, landscape x/y — 0..1 slider
  scale: orient(0.35, 0.4, { min: 0.05, max: 2 }),
  localization: loc({
    // dil bloğu: bir kez yazılır, her dile açılır
    caption: text("PLAY NOW"), // veya text({ en: "PLAY NOW", tr: "HEMEN OYNA" })
    fontColor: color("#ffffff"),
    fontFamily: FONT
  }),
  isEnabled: bool(true), // false olursa bu component'in görselleri export'ta çıkar
  assets: { ctaButton: image("inGameCTAButton.png") } // yol: assets/ klasörüne göre
});
```

Alan tipleri: `num, bool, color, text, select, language, image, sound, model (.glb / .glb.zip), font, data`.
Yardımcılar: `group(label, {...})`, `loc({...})`, `pos(...)`, `orient(...)`, `atlas(...)`, `spine(...)`.

**Sprite atlas ve Spine.** Birden fazla dosyadan oluşan asset'ler için:

```js
assets: {
  // TexturePacker JSON (hash) + PNG → selectedAtlases.gems, loader anahtarı "gems_PNG"
  gems: atlas("gems", "gems/gems.png", "gems/gems.json"),
  // PNG + iskelet JSON (.json veya .json.zip) + .atlas metni → selectedSpines.hero
  hero: spine("hero", "spines/hero/hero.png", "spines/hero/hero.json.zip", "spines/hero/hero.atlas.txt")
}
```

İkisi de `data` tipinde alan kullanır: JSON runtime'da nesneye, `.atlas.txt` metne çevrilir, `.json.zip` data URI
olarak kalır ve Spine loader'ı açar. Export tarafında JSON / metin / ZIP içerikten tanınır ve doğrulanır.
Spine dosyaları **4.2** formatındadır; runtime `@esotericsoftware/spine-threejs ~4.2` ile sabitlenmiştir (4.3
runtime'ı 4.2 dosyalarını okuyamaz). Spine editörü sürümü değişirse runtime sürümü de birlikte güncellenmelidir.

**Sabit anahtar.** Oyun kodu bir asset'e sabit bir adla erişiyorsa (`loadedTexturesInGameMap.get("board")`)
alana `key` verin: `image("board.png", { key: "board" })`. Loader'lar asset'i bu adla saklar; varyantta dosya
değişse de ad aynı kalır. `atlas()` / `spine()` anahtarları (`gems_PNG`, `hero_JSON` …) kendileri üretir.

**Bir alanı yeniden adlandırırken** eski yolu yaz: `num(1, { was: "components.x.oldName" })`.
Mevcut varyantlar otomatik taşınır; bilinmeyen yollar (ör. yeni release'te silinen alanlar) yetim olarak
raporlanır ve uygulanmaz. `--strict` (veya `strict: true`) verilirse export hata verir.

## Varyant dosyası

```json
{
  "name": "red-cta",
  "overrides": {
    "components.ctaButton1.localization.caption": { "en": "TRY IT", "tr": "HEMEN DENE" },
    "components.banner1.color": "#ffcc00",
    "components.inGameLogo1.assets.logo": "file:../assets/logo3.png"
  }
}
```

`file:` yolları varyant dosyasına göredir. Dev panelindeki **Download variant** aynı formatta dosya indirir
(yüklenen görseller dosyanın içine gömülü gelir).

## Önizleme köprüsü (Studio için)

Oyunu iframe'de açan bir sayfa (Studio, dev paneli) şunu gönderir:

```js
iframe.contentWindow.postMessage({ type: "pl:preview", overrides: {...}, assets: { "u/abc.png": "data:image/png;base64,..." } }, "*");
iframe.contentWindow.postMessage({ type: "pl:reset" }, "*");
// oyun hazır olunca parent'a { type: "pl:ready", overrides, languages } yollar
iframe.contentWindow.postMessage({ type: "pl:inspect", enabled: true }, "*"); // aşağıda: Select
```

**Canlı önizleme.** Değişiklikler mümkünse oyun baştan başlamadan uygulanır: runtime yeni config'i çözer,
oyun (`applyLiveConfig`, `src/main.js`) sadece değişen bileşenlere `update → load → render` uygular. Bileşenler
ikinci `render()`'da resize yolunu kullandığı için oyun durumu korunur.
Şu değişiklikler oyunu yeni değerlerle **yeniden başlatır** (dev panelinde ↻ ile işaretli):

- `{ restart: true }` alanlar: oyunun yalnızca başlarken okuduğu değerler (ör. level düzeni).
- `isEnabled` anahtarları, dil ve görsel dışındaki asset'ler (ses, font, model).
- Sayfada olmayan yeni bir dosya (ör. params.js'te değiştirilen görsel yolu) veya eklenen/silinen alanlar.

`npm run dev` sırasında `src/params.js` dosyasını kaydetmek de aynı yoldan geçer (Vite HMR); sayfa sadece
yukarıdaki durumlarda yenilenir. Yeni bir bileşen alanı canlı görünmüyorsa, o bileşenin `render()`'ı değeri
yalnızca ilk çizimde okuyordur: ya bileşeni düzeltin ya da alana `restart: true` verin.

**Oyunda seçerek düzenleme (Studio "Select").** Studio `{ type: "pl:inspect", enabled }` gönderince runtime
oyunun üstüne şeffaf bir katman koyar: fare altındaki bileşeni kırmızı çerçeveyle gösterir, tıklamada parent'a
`{ type: "pl:select", componentId, related, assets }` yollar. Studio önce tıklanan şeyin görsel alanlarını
(`assets`: ör. bir taşa tıklanınca gems atlasının PNG+JSON'u, hangi kare olduğuyla), sonra bileşenin
alanlarını, en altta ilişkili bileşenleri (`related`: `parent`, `contains`, `uses` = bileşenin referans
tuttuğu başka bir bileşen, ör. ortak asset yükleyici ya da booster'lar, `below` = tıklanan noktanın
altındakiler) gösterir. `{ type: "pl:highlight", componentId }` bir bileşeni dışarıdan çerçeveler. Oyun bunu `src/main.js`'te açar:

```js
registerInspector(
  createSceneInspector({
    components,
    canvas: renderer.domElement,
    views: () => [
      { scene: orthoScene, camera: orthoCamera },
      { scene: perspScene, camera: activeCamera }
    ]
  })
);
```

`createSceneInspector` (`lib/playinFramework3D/modules/sceneInspector.js`) bileşenlerin tuttuğu Three.js
nesnelerinden (`gameObjectsMap` ve kendi alanları) kimin neyi çizdiğini çıkarır; bileşenlere kod eklemek
gerekmez. Görselin şeffaf kısımları ve stencil maskesinin dışında kalan kısımlar seçilmez; tıklanan
görselin hangi asset'ten geldiği loader'ların önbelleklerinden (`loadedTexturesInGameMap`,
`loadedAtlasTexturesMap`) bulunur. Seçilen bileşenin `params.js`'te alanı yoksa en yakın üst bileşen seçilir. Bir parça yanlış
bileşene gidiyorsa, o nesneyi sahiplenen bileşen onu kendi alanında ya da `gameObjectsMap`'inde tutmalıdır.

**Playtest (bot):** Studio bir varyantın zorluğunu ölçmek ve yeni release'te varyantların çalıştığını
doğrulamak için oyunu gizli bir önizlemede kendi kendine oynatır. Oyun kuralları bir adaptörle verir
(`playable/kit/runtime.js`, "Bot playtest"; örnek: Match Squad'ın `grid/BotAdapter.js`'i):

```js
registerBot({
  status: () => ({ state: "ready", movesLeft: 12, goalsLeft: 30 }), // "busy" | "ready" | "won" | "lost"
  moves: () => [{ from: [0, 1], to: [0, 2], score: 7 }], // "ready" iken geçerli hamleler
  play: (move) => { /* gerçek input yolundan uygula */ },
  setSpeed: (x) => { /* animasyonları ve delta'yı x kat hızlandır */ }
});
```

Kit hamleyi seçer (greedy: en yüksek `score`, eşitlikte rastgele), sonucu `pl:bot-result` ile bildirir;
sayfadaki hatalar ve kit'in `[playable]` hataları sonucu "error" yapar.

**Level editörü:** Bir metin alanına `editor: { type: "board", rows: "|", cells: ",", levels: "&", palette }`
verilirse Studio onu ızgara olarak düzenler. Palet girdisi: `{ token, label, color, group, match?, image? }`;
`image`: `{ atlas: "<atlas() alanının yolu>", frame }` ya da `{ image: "<image alanının yolu>" }`.
`match: true` olan taşlar başlangıç eşleşmesi kontrolüne ve "Random fill"e girer.

## Ağlar

`default, applovin, ironsource, smadex, unity, mintegral, appgrowth, moloco, facebook, google, liftoff, tiktok`

Ağların runtime davranışı `playable/kit/networks.js`'te, export anındaki farkları (head tag'leri, JS'i ayrı
dosyaya ayırma, TikTok için asset klasörü, paketleme farkları) `playable/export/networks.js`'te.
İkisi de `@common-packages/ad-network-settings`'ten taşındı; private registry gerekmiyor.
Boyut limitleri (`maxMb`) son paket üzerinde uygulanır — ağların güncel spesifikasyonuyla kontrol edin.
İki listenin anahtarları aynı olmalıdır; test bunu kontrol eder. Yeni ağ eklerken ikisine birden ekleyin.
AppGrowth DAPI shim'i `playable/export/shims/appgrowth.js`'tedir ve bilerek değiştirilmeden taşınmıştır.

Her export profili Studio'nun göstereceği `label`, `container` (`html` | `zip`) ve `storeUrl` alanlarını taşır.
`storeUrl`, CTA'nın `options.link` adresini ağa iletip iletmediğini söyler:

| `storeUrl` | Ağlar                                                  | Anlamı                                                                 |
| ---------- | ------------------------------------------------------ | ---------------------------------------------------------------------- |
| `always`   | default, unity, ironsource, liftoff                    | URL MRAID'e / `window.open`'a gider                                    |
| `maybe`    | facebook, moloco                                       | Önce URL ile MRAID denenir, yoksa ağ SDK'sı kampanyadaki mağazayı açar |
| `never`    | applovin, mintegral, appgrowth, google, tiktok, smadex | Ağ kampanyadaki mağazayı açar; `options.link` etkisizdir               |

Varyant store linkini değiştirmişse `always` olmayan ağlarda export raporuna (`report.warnings`) uyarı düşer.
Davranış değiştirilmedi; tablo mevcut koddan çıkarıldı ve cihaz QA'sıyla doğrulanmalıdır.

## Release sözleşmesi ve doğrulama

Node.js 22+ kullanın. `npm ci`, `npm test`, `npm run build` sırasıyla kurulumu ve kontrolleri yapar.
Format sürümü **2**'dir; eski format 1 release'leri yeniden build edilmelidir. Bundan sonraki varyantlar
aynı release üzerinden build gerektirmeden üretilir. Manifest `schemaVersion`, içerik tabanlı `releaseId`
ve model capability bilgilerini taşır. Final ağ çıktısı yerine **release + varyant JSON + uploads** saklanmalıdır.

Exporter geçersiz dil/değer, strict modda bilinmeyen alan, eksik asset, güvensiz dosya yolu, yanlış MIME/içerik,
boyut limiti veya desteklenmeyen model bağımlılığında hata verir. CLI bütün kombinasyonları doğruladıktan
sonra çıktıları geçici dosyadan atomik rename ile yazar; doğrulama hatası olan batch yeni dosya yazmaz.
Önceki başarılı export dosyaları otomatik silinmez. Çıktı isimleri çakışan varyantlar reddedilir.
Her başarılı batch sonunda `exports/report.json` yazılır (Studio'nun export kaydı): `releaseId`, `profileVersion`
ve her çıktı için `variant`, `network`, `language`, `path`, `packageBytes`, `sizeBytes`, `storeUrl`, `warnings`,
`orphans`, `pruned`. Rapor dosya yazımından önce silinip en son yazılır; raporu olmayan klasör yarım kalmış
bir batch'tir. `--langs` ile verilen dil varyanttaki dil alanını ezer; son dil `language` alanında görünür.
`--key=value` ve `--key value` desteklenir. Mintegral çıktısı varyant klasörü içinde `mintegral.html` olur.

Tarayıcı/Node entegrasyonunda `packageVariant(releaseHtml, options)` kullanılmalıdır; bu fonksiyon
ZIP/HTML üretir ve **son paket boyutunu** kontrol eder. `exportVariant()` doğrulanmış dosya listesini verir;
ZIP profillerinin son boyut kontrolü ancak paketleme sırasında yapılır. Limitler MiB cinsindedir.
`report.sizeBytes` ham toplam, `report.packageBytes` paket boyutudur. Network limitleri/profilleri ilgili
kampanya şartları ve gerçek SDK ortamında ayrıca doğrulanmalıdır.

Asset ID'leri assets/ altındaki güvenli göreli yollardır. PNG/JPEG/WebP/GIF, MP3/AAC/OGG/WAV/M4A,
WOFF/WOFF2/TTF/OTF ve GLB/tek-GLB ZIP desteklenir. Yerel dosyanın MIME türü içeriğinden belirlenir.
Upload data URI'leri doğru MIME ve kanonik base64 içermelidir. Asset başına varsayılan üst sınır 32 MiB;
alan üzerindeki `maxBytes` daha düşük sınır koyabilir. ZIP'in açılmış boyutu da sınırlandırılır.
GLB dış kaynak kullanamaz; Draco/KTX2 decoder'ları release'te olmadığından bu extension'lar reddedilir.
Meshopt desteklenir. macOS ZIP metadata dosyaları model sayılmaz.

Preview yalnızca release/dev modunda açıktır; final export `publish` modundadır ve preview mesajlarını,
`window.name` override'larını yok sayar. Mesajlar parent pencereden ve aynı origin'den gelmelidir.
Cross-origin/sandbox önizleme gerektiğinde iframe belgesinde oyun başlamadan önce en az 16 karakterlik
rastgele `window.__PL_PREVIEW_TOKEN__` tanımlayın ve her mesaja `token` ekleyin. Token kullanıldığında
aynı-origin mesajlarda da zorunludur. SDK postMessage protokolleri bu preview protokolünden ayrıdır.

Studio için önizleme sözleşmesi:

- iframe export edilmiş dosyayı değil **release HTML'ini** açar; publish modu önizleme mesajlarını yok sayar.
- Studio ile aynı origin'den servis ediliyorsa token gerekmez. Blob URL veya başka port kullanılıyorsa ham
  `dist/index.html` yeterli değildir: Studio, oyun kodundan önce `window.__PL_PREVIEW_TOKEN__`'ı tanımlayan
  küçük bir wrapper sayfa üretmelidir.
- Diskte blob'lar tam sha256 ile saklanabilir, ama HTML ve varyant içindeki asset id'si bugünkü formatta kalır:
  `u/<sha256'nın ilk 12 hex'i>.<uzantı>` (CLI'daki `loadVariant` ile aynı). Studio ikinci bir id formatı
  üretmemeli; `packageVariant`'a `uploads: { [assetId]: { mime, base64 } }` geçmelidir.

Build, import edilmiş CSS'i HTML içine gömer; desteklenmeyen yan dosyaları sessizce silmez, hata verir.
`public/` otomatik kopyalanmaz: oyun asset'leri params üzerinden tanımlanmalıdır.
Dev sunucusu varsayılan olarak localhost'tadır; LAN testi için `npm run dev -- --host 0.0.0.0` kullanın.

SDK görünürlüğü ve document visibility oyun zamanını, GSAP animasyonlarını, sesi ve mağaza açmayı durdurur.
Yeni gameplay timer'ları için `playable.schedule(callback, milliseconds)` / `playable.cancel(timer)`
kullanın; native `setTimeout` pause sözleşmesine dahil değildir. Mintegral, asset'ler hazır olduğunda
`gameReady()` bildirir; `gameStart()` / `gameClose()` host olayları oyun duraklamasını yönetir.

### Studio playtest sonuçları

Kısa test `pl:bot` mesajında `mode: "check"` kullanır. Hedef hamle sayısından sonra oyun tekrar
`ready` olduğunda `checked` döner; süre aşımı veya takılma `checked` değildir. Eski Studio test
sonuçlarını onay olarak kullanmayın. Yeni kontrol protokolü için oyunun bu runtime ile bir kez
yeniden build edilip yüklenmesi gerekir; sonraki varyasyonlar yeniden build gerektirmez.
Bot seed'i hamle seçimine aittir; oyun içi rastgeleliğin tekrar üretilebilir olması adaptörün sorumluluğudur.
