import { html, nothing, type TemplateResult } from 'lit';

/** A text from the dictionary with **bold** parts, as Lit templates: the text is escaped, never parsed as markup. */
export function richText(text: string): (TemplateResult | typeof nothing)[] {
  return text.split('**').map((part, index) => {
    if (part === '') return nothing;
    return index % 2 === 1 ? html`<b>${part}</b>` : html`${part}`;
  });
}
