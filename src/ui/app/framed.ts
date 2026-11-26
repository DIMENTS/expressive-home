// Another website can put the dashboard in a frame and lay something over it, so that a tap lands where the person
// does not see. A page on GitHub Pages cannot forbid that by a header, so the app refuses it itself.

/** Whether the page is inside a frame; when the question itself fails, it is taken as yes. */
export function isFramed(target: Window): boolean {
  try {
    return target.top !== target.self;
  } catch {
    return true;
  }
}
