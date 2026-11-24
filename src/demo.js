// Demo accounts and fixtures exist only outside the production build.
// Vite replaces __DEMO__ at build time; Node tests leave it undefined.
export const DEMO = typeof __DEMO__ === 'undefined' || __DEMO__;
