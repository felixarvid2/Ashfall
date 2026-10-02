/**
 * Shared prompt style so every asset looks like it belongs to the same game (brief §9.3).
 * Each prompt = specific description + STYLE_BASE.
 */
import type { AssetEntry } from '../../src/data/assetManifest';

export const STYLE_BASE =
  'dark gritty sci-fi, worn industrial metal, rust and ash, grim atmosphere, PBR materials, game-ready asset, muted desaturated colors';

export const NEGATIVE_PROMPT = 'cartoon, bright colors, toy, cute, low quality, blurry, text, watermark';

/** Texture style used by the refine step unless the asset overrides it. */
export const TEXTURE_STYLE =
  'weathered gunmetal and rusted steel, soot and ash dust, chipped paint, subtle emissive details, realistic PBR, muted desaturated palette';

/** Lumen growth is always described the same way. */
export const LUMEN = 'bioluminescent sickly green fungal-crystal growth';

/** Meshy limits prompts to 800 characters (docs.meshy.ai, text to 3D). */
const MAX_PROMPT = 800;

export function buildPrompt(entry: AssetEntry): string {
  return clip(`${entry.prompt}, ${STYLE_BASE}`);
}

export function buildTexturePrompt(entry: AssetEntry): string {
  return clip(entry.texturePrompt ?? `${entry.prompt}; ${TEXTURE_STYLE}`);
}

export function buildNegativePrompt(entry: AssetEntry): string {
  return entry.negativePrompt ?? NEGATIVE_PROMPT;
}

function clip(text: string): string {
  return text.length <= MAX_PROMPT ? text : text.slice(0, MAX_PROMPT - 1).replace(/,[^,]*$/, '');
}

/** Concept image prompt: front view on a plain background works best for image-to-3D. */
export function buildConceptPrompt(entry: AssetEntry): string {
  return clip(
    `${entry.conceptPrompt ?? entry.prompt}, full body, front view, centered, plain light grey background, ` +
      `game character concept art, ${STYLE_BASE}`,
  );
}

/** Skill icons are full-bleed painted emblems; item icons are a single object on transparency. */
export function isSkillIcon(entry: AssetEntry): boolean {
  return entry.id.startsWith('icon.skill_');
}

/** Inventory icon prompt: one object, readable at 64 px, consistent painted style. */
export function buildIconPrompt(entry: AssetEntry): string {
  if (isSkillIcon(entry)) {
    return clip(
      `square game ability icon: ${entry.prompt}, bold centered silhouette filling the frame, painted digital art, ` +
        `dark gritty sci-fi, dark smoky background with a strong orange or cyan accent glow, high contrast, readable at 48 px, no text, no border`,
    );
  }
  return clip(
    `game inventory icon of a ${entry.prompt}, single object centered, three-quarter view, painted digital art, ` +
      `dark gritty sci-fi, worn metal, rust and ash, dramatic rim light, muted colors with a strong accent glow, no text, no frame`,
  );
}
