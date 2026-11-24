import { css } from 'lit';

/** The page itself: background, text colour and font, in both modes. */
export const pageStyles = css`
  html { color-scheme: light; }
  html[data-mode="dark"] { color-scheme: dark; }
  body {
    margin: 0; background: var(--page-bg); color: var(--page-fg);
    font-family: var(--font-family); font-size: var(--type-body-l-size); line-height: var(--type-body-l-line);
    -webkit-font-smoothing: antialiased; transition: background-color var(--motion-effects), color var(--motion-effects);
  }
  @media (prefers-reduced-motion: reduce) {
    body { transition: none; }
  }
`;

/** Adopts the page styles into the document once; constructable style sheets need no inline style. */
export function adoptPageStyles(doc: Document = document): void {
  const sheet = pageStyles.styleSheet;
  if (sheet && !doc.adoptedStyleSheets.includes(sheet)) doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, sheet];
}
