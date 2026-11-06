/**
 * Build version shown in the UI (side navigation footer, login page):
 * `version` from package.json plus the short git commit of the build — both
 * injected by vite.config.js `define`.
 */
export const APP_VERSION_TEXT = __APP_COMMIT__ ? `v${__APP_VERSION__} (${__APP_COMMIT__})` : `v${__APP_VERSION__}`;
