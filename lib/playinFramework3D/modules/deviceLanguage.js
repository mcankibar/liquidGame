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

//Checks component of banner1's localization for supported languages
function getSupportedLanguages(currentGameConfig)
{
  return Object.keys(currentGameConfig.components.banner1.localization);
}