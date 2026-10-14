/**
 * The interface fonts, served from public/assets/fonts/ (Google Fonts, SIL Open Font License):
 * Rajdhani for text and headings, Share Tech Mono for numbers. Registered from code so the URLs
 * follow the build's base path.
 */
const FACES: [family: string, file: string, weight: number][] = [
  ['Rajdhani', 'rajdhani-500', 500],
  ['Rajdhani', 'rajdhani-600', 600],
  ['Rajdhani', 'rajdhani-700', 700],
  ['Share Tech Mono', 'share-tech-mono-400', 400],
];

export function registerFonts(): void {
  const base = `${import.meta.env.BASE_URL}assets/fonts/`;
  const style = document.createElement('style');
  style.textContent = FACES.map(
    ([family, file, weight]) => `@font-face { font-family: '${family}'; src: url('${base}${file}.woff2') format('woff2'); font-weight: ${weight}; font-style: normal; font-display: swap; }`,
  ).join('\n');
  document.head.append(style);
}
