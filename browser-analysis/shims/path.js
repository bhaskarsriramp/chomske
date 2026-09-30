/** shims/path.js: POSIX join/resolve/basename/dirname/extname, for scratch paths that are never opened. */
function normalize(p) {
  const abs = p.startsWith("/");
  const out = [];
  for (const part of p.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return (abs ? "/" : "") + out.join("/");
}
export const join = (...p) => normalize(p.filter(Boolean).join("/"));
export const resolve = (...p) => {
  let r = "";
  for (const s of p) { if (!s) continue; r = String(s).startsWith("/") ? String(s) : r + "/" + s; }
  return normalize(r || "/");
};
export const basename = (p, ext) => { const b = String(p).split(/[\\/]/).pop(); return ext && b.endsWith(ext) ? b.slice(0, -ext.length) : b; };
export const dirname = (p) => String(p).split(/[\\/]/).slice(0, -1).join("/") || "/";
export const extname = (p) => { const b = basename(p); const i = b.lastIndexOf("."); return i > 0 ? b.slice(i) : ""; };
export const sep = "/";
export default { join, resolve, basename, dirname, extname, sep };
