/// <reference types="vite/client" />

// Baked in by vite.config.ts at build time. Used by AdminSettings to show
// the actual build timestamp + git SHA instead of `new Date()` at page
// load (which was meaningless).
declare const __BUILD_TIME__: string;
declare const __BUILD_SHA__: string;
