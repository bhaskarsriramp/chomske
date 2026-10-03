/**
 * voiceModel.js: which speech model the voices use. Its own file so the
 * Voice tab's voiceover (voice.js) and the narrator it speaks through
 * (autodemo/narrator.js) can both name it without importing each other.
 */
export const VOICE_MODEL = String(process.env.STUDIO_VOICE_MODEL || "gemini-3.8-flash-tts").trim();

export default VOICE_MODEL;
