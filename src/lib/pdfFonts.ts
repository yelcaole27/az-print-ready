let cachedFontEmbedCSS: string | null = null;

/**
 * Extracts and prepares CSS @font-face rules for embedding Google Fonts into SVG / canvas
 * during html-to-image or PDF rendering.
 */
export function getFontEmbedCSS(): string {
  if (cachedFontEmbedCSS !== null) {
    return cachedFontEmbedCSS;
  }

  if (typeof document === 'undefined') {
    return '';
  }

  const cssRules: string[] = [];

  try {
    // Scan document style sheets for font faces
    for (let i = 0; i < document.styleSheets.length; i++) {
      const sheet = document.styleSheets[i];
      try {
        const rules = sheet.cssRules || sheet.rules;
        if (!rules) continue;
        for (let j = 0; j < rules.length; j++) {
          const rule = rules[j];
          if (rule instanceof CSSFontFaceRule) {
            cssRules.push(rule.cssText);
          }
        }
      } catch {
        // Cross-origin stylesheet access might throw, ignore safely
      }
    }
  } catch {
    // Ignore error
  }

  cachedFontEmbedCSS = cssRules.join('\n');
  return cachedFontEmbedCSS;
}
