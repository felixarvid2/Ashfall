/**
 * URL of a status icon (public/assets/ui/status/, from game-icons.net). Absolute, because callers put it in a CSS
 * custom property: a relative url() there resolves against the stylesheet that uses the variable (assets/…css),
 * which doubled the path to assets/assets/ui/status/.
 */
export const statusIconUrl = (id: string): string => {
  const rel = `${import.meta.env.BASE_URL}assets/ui/status/${id}.svg`;
  try {
    return typeof document === 'undefined' ? rel : new URL(rel, document.baseURI).href;
  } catch {
    return rel; // an unparsable base (tests) keeps the relative path
  }
};
