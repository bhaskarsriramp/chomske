/**
 * tools/register.mjs: `node --import ./tools/register.mjs tools/genTemplates.mjs`
 * gives the server's locator a canvas that remembers what it drew
 * (tools/recCanvas.mjs), without touching the app's files.
 */
import { register } from "node:module";
register(new URL("./resolve.mjs", import.meta.url));
