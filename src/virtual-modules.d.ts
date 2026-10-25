/** Slim runtime asset manifest, built by tools/runtimeManifestPlugin.ts from assets/manifest.json. */
declare module 'virtual:asset-manifest' {
  import type { RuntimeManifest } from '../src/data/assetManifest';
  const manifest: RuntimeManifest;
  export default manifest;
}
