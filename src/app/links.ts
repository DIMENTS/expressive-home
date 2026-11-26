import { GALLERY_CODE_LIMIT } from '../theme/theme-file';

/** The theme gallery. The dashboard never fetches anything from it: it only opens the address in a new tab. */
export const GALLERY_URL = 'https://github.com/DIMENTS/expressive-home-themes';
/** The gallery's address as people can type it over. */
export const GALLERY_TEXT = 'github.com/DIMENTS/expressive-home-themes';
/** The longest code that still goes into the address of the form: longer addresses are not opened everywhere. */
export const FORM_CODE_LIMIT = 6000;

export type GalleryForm = { kind: 'filled' | 'name-only'; url: string } | { kind: 'too-big' };

/** The form of the gallery with the name and the code filled in; with a long code only the name, too large nothing. */
export function galleryForm(name: string, code: string): GalleryForm {
  if (code.length > GALLERY_CODE_LIMIT) return { kind: 'too-big' };
  const query = new URLSearchParams({ template: 'theme.yml', name });
  const filled = code.length <= FORM_CODE_LIMIT;
  if (filled) query.set('code', code);
  return { kind: filled ? 'filled' : 'name-only', url: `${GALLERY_URL}/issues/new?${query.toString().replace(/\+/g, '%20')}` };
}
