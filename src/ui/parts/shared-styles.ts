import { css } from 'lit';

/** Nothing moves for who asked the system for that: stronger than any rule of a part, whatever its selector. */
export const stillStyles = css`
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { transition: none !important; animation: none !important; }
  }
`;

/**
 * The shared base of every part: native controls take the theme's font and colour,
 * the focus ring shows on keyboard use, and `.hit` gives a small control an invisible
 * touch target of at least --target-min around it.
 */
export const sharedStyles = css`
  :host { box-sizing: border-box; }
  *, *::before, *::after { box-sizing: inherit; }
  button, input { font: inherit; color: inherit; }
  :focus-visible { outline: var(--focus-width) solid var(--focus-color); outline-offset: var(--focus-offset); }
  .hit { position: relative; }
  .hit::after {
    content: ""; position: absolute; top: 50%; left: 50%;
    width: max(100%, var(--target-min)); height: max(100%, var(--target-min)); transform: translate(-50%, -50%);
  }
  /* only for screen readers: there, but nothing to see */
  .unseen { position: absolute; width: 0; height: 0; margin: 0; overflow: hidden; white-space: nowrap; clip-path: inset(50%); }
  ${stillStyles}
`;
