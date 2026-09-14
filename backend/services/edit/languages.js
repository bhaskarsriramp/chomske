/**
 * languages.js: the languages captions can be translated into.
 *
 * ── ONLY LANGUAGES THE EXPORT CAN DRAW ───────────────────────────────────────
 * Every script here has a font in assets/fonts (render.js picks the face per
 * word). Urdu, Arabic, Chinese and Japanese are missing on purpose: offering a
 * translation that exports as empty boxes is worse than not offering it.
 *
 * The "-Latn" entries are the same language in English letters, the way most
 * Indian creators and their audiences actually type it. For a Telugu speaker
 * making a video for Hindi viewers, "Hindi in Roman" is often the one they want.
 *
 * `prompt` is what the model is told to write; `label` is what the creator sees.
 */
export const CAPTION_LANGUAGES = [
  { code: "en", label: "English", native: "English", prompt: "English" },
  { code: "hi", label: "Hindi", native: "हिन्दी", prompt: "Hindi, in Devanagari script" },
  { code: "hi-Latn", label: "Hindi (Roman)", native: "Hindi", prompt: "Hindi written in English letters (Roman script), the way people type Hindi on WhatsApp, keeping English words in English" },
  { code: "te", label: "Telugu", native: "తెలుగు", prompt: "Telugu, in Telugu script" },
  { code: "te-Latn", label: "Telugu (Roman)", native: "Telugu", prompt: "Telugu written in English letters (Roman script), the way people type Telugu on WhatsApp, keeping English words in English" },
  { code: "ta", label: "Tamil", native: "தமிழ்", prompt: "Tamil, in Tamil script" },
  { code: "ta-Latn", label: "Tamil (Roman)", native: "Tamil", prompt: "Tamil written in English letters (Roman script), the way people type Tamil on WhatsApp, keeping English words in English" },
  { code: "kn", label: "Kannada", native: "ಕನ್ನಡ", prompt: "Kannada, in Kannada script" },
  { code: "kn-Latn", label: "Kannada (Roman)", native: "Kannada", prompt: "Kannada written in English letters (Roman script), keeping English words in English" },
  { code: "ml", label: "Malayalam", native: "മലയാളം", prompt: "Malayalam, in Malayalam script" },
  { code: "ml-Latn", label: "Malayalam (Roman)", native: "Malayalam", prompt: "Malayalam written in English letters (Roman script), keeping English words in English" },
  { code: "bn", label: "Bengali", native: "বাংলা", prompt: "Bengali, in Bengali script" },
  { code: "mr", label: "Marathi", native: "मराठी", prompt: "Marathi, in Devanagari script" },
  { code: "gu", label: "Gujarati", native: "ગુજરાતી", prompt: "Gujarati, in Gujarati script" },
  { code: "pa", label: "Punjabi", native: "ਪੰਜਾਬੀ", prompt: "Punjabi, in Gurmukhi script" },
  { code: "or", label: "Odia", native: "ଓଡ଼ିଆ", prompt: "Odia, in Odia script" },
  { code: "es", label: "Spanish", native: "Español", prompt: "Spanish" },
  { code: "fr", label: "French", native: "Français", prompt: "French" },
  { code: "de", label: "German", native: "Deutsch", prompt: "German" },
  { code: "pt", label: "Portuguese", native: "Português", prompt: "Portuguese" },
  { code: "id", label: "Indonesian", native: "Bahasa Indonesia", prompt: "Indonesian" },
];

export const LANGUAGE_CODES = new Set(CAPTION_LANGUAGES.map((l) => l.code));
export const languageByCode = (code) => CAPTION_LANGUAGES.find((l) => l.code === code) || null;

export default { CAPTION_LANGUAGES, LANGUAGE_CODES, languageByCode };
