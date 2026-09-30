/** shims/fsp.js: the analysis only makes scratch directories, and never reads them here. */
export const mkdir = async () => {};
export const rm = async () => {};
export const writeFile = async () => {};
export const readFile = async () => { throw new Error("no files in the browser"); };
export const readdir = async () => [];
export default { mkdir, rm, writeFile, readFile, readdir };
