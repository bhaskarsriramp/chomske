/** shims/demoService.js: analyse.js reads only STUDIO_LIMITS.frameEvery, as demoService.js defines it. */
export const STUDIO_LIMITS = { frameEvery: Number(process.env.STUDIO_FRAME_EVERY || 2) };
