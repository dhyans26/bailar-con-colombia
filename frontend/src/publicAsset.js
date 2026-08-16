// Resolves a path in public/ so it works both under Vite's dev server and
// inside the packaged Electron app, which loads index.html via file:// --
// there, a root-absolute "/foo.png" resolves to the filesystem root instead
// of the app bundle, so every such reference must go through BASE_URL
// (which Vite derives from vite.config.js's `base: './'`) instead.
export function publicAsset(path) {
  return `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`
}
