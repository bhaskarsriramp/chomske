/** shims/url.js: fileURLToPath, for modules that find their own folder. */
export const fileURLToPath = (u) => new URL(String(u)).pathname;
export const pathToFileURL = (p) => new URL("file://" + p);
export default { fileURLToPath, pathToFileURL };
