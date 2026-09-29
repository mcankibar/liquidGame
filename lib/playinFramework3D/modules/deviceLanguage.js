export function deviceLanguage(currentGameConfig) {
  const supportedLanguages = getSupportedLanguages(currentGameConfig);

  let lang = navigator.userLanguage || navigator.language;
  if (lang) lang = lang.toLowerCase();
  let deviceLanguage = lang || "en";

  if (deviceLanguage.includes("-")) {
    deviceLanguage = deviceLanguage.split("-")[0];
  }

  if (!supportedLanguages.includes(deviceLanguage)) {
    return "en";
  }

  return deviceLanguage;
}

// Languages present on any component localization block. Falls back to English.
function getSupportedLanguages(currentGameConfig) {
  const langs = new Set();
  const components = currentGameConfig.components || {};
  for (const comp of Object.values(components)) {
    const localization = comp && comp.localization;
    if (!localization || typeof localization !== "object") continue;
    for (const key of Object.keys(localization)) {
      if (/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/.test(key)) langs.add(key);
    }
  }
  if (langs.size === 0) langs.add("en");
  return [...langs];
}
