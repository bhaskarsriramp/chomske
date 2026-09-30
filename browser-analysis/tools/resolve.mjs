const REC = new URL("./recCanvas.mjs", import.meta.url).href;
export async function resolve(specifier, context, next) {
  if (specifier === "@napi-rs/canvas" && context.parentURL !== REC) return { url: REC, shortCircuit: true };
  return next(specifier, context);
}
