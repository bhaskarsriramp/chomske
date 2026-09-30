/** shims/crypto.js: timeline.js uses randomBytes(n).toString("hex"), for ids. */
export function randomBytes(n) {
  const b = crypto.getRandomValues(new Uint8Array(n));
  return { toString: () => Array.from(b, (v) => v.toString(16).padStart(2, "0")).join("") };
}
export default { randomBytes };
