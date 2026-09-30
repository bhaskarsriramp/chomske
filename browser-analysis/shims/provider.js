/**
 * shims/provider.js: backend/services/ai/provider.js, for the browser.
 * No model is called from here; whether the server has one decides whether
 * the analysis asks it anything (analyse.js), so that comes from the server.
 */
export const providerReady = () => !!self.__analysis.providerReady;
export const MODEL = "server";
