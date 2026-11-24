import { css } from 'lit';
import { CONNECT_STACK_MAX_PX, PHONE_MAX_PX } from '../breakpoints';

/** The card of the connect screen and the pair screen: the explanation on the left, the form on the right. */
export const connectCardStyles = css`
    :host { display: grid; grid-template-columns: minmax(0, 1fr); place-items: center; min-height: 100vh; padding: var(--space-32) max(var(--space-24), env(safe-area-inset-right)) var(--space-32) max(var(--space-24), env(safe-area-inset-left)); }
    .card {
      width: 100%; max-width: var(--connect-max-width); display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: var(--space-8); padding: var(--space-8); background: var(--section-bg); border-radius: var(--section-radius);
    }
    @media (width < ${CONNECT_STACK_MAX_PX}px) { .card { grid-template-columns: minmax(0, 1fr); } }
    .intro { position: relative; overflow: hidden; padding: var(--space-32); border-radius: var(--shape-xl); background: var(--section-hero-bg); color: var(--section-hero-fg); }
    .art {
      position: absolute; top: var(--connect-art-offset); right: var(--connect-art-offset); width: var(--connect-art-size); height: var(--connect-art-size);
      background: var(--connect-art-bg); clip-path: var(--shape-cookie); animation: spin var(--motion-drift) linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    h1 {
      position: relative; margin: 0; max-width: var(--connect-title-width); font-size: var(--type-greeting-size); line-height: var(--type-greeting-line);
      font-weight: var(--weight-strong); letter-spacing: var(--tracking-display);
    }
    .lead { position: relative; margin: var(--space-12) 0 0; max-width: var(--connect-lead-width); font-size: var(--type-body-l-size); line-height: var(--type-body-l-line); }
    .steps { list-style: none; margin: var(--space-32) 0 0; padding: 0; display: grid; gap: var(--space-20); counter-reset: step; }
    .steps > li {
      display: grid; grid-template-columns: var(--connect-step-size) minmax(0, 1fr); gap: var(--space-12); align-items: start;
      font-size: var(--type-label-l-size); line-height: var(--type-body-l-line);
    }
    .steps > li::before {
      counter-increment: step; content: counter(step); width: var(--connect-step-size); height: var(--connect-step-size); display: grid; place-items: center;
      background: var(--c-primary); color: var(--c-on-primary); clip-path: var(--shape-cookie); font-weight: var(--weight-strong);
    }
    .steps > li > div { padding-top: var(--space-6); }
    b { font-weight: var(--weight-strong); }
    .form { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--space-20); align-content: center; padding: var(--space-24) var(--space-24) var(--space-24) var(--space-20); }
    h2 { margin: 0; font-size: var(--type-title-size); line-height: var(--type-title-line); font-weight: var(--weight-strong); }
    .actions { display: grid; gap: var(--space-8); }
    @media (width < ${PHONE_MAX_PX}px) {
      :host { padding: max(var(--space-12), env(safe-area-inset-top)) var(--space-12) max(var(--space-12), env(safe-area-inset-bottom)); }
      .intro { padding: var(--space-24) var(--space-20); }
      h1 { font-size: var(--header-title-size); }
      .steps { margin-top: var(--space-20); gap: var(--space-14); }
      .form { padding: var(--space-20) var(--space-12) var(--space-16); }
    }
`;
