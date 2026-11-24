// The pictures of the app in the Homey App Store: the built dashboard with the example house, on a laptop and a tablet.
// Run `npm run build` first, then `npm run store-images`.
import { at, houseOn, withBrowser } from './pictures.mjs';

/** The sizes the store asks for: the same picture. */
const SIZES = { small: 0.25, large: 0.5, xlarge: 1 };
const [WIDTH, HEIGHT] = [1000, 700];

async function dashboard(browser, grouping) {
  const page = await houseOn(browser, {
    width: 1280, height: 800, scale: 2,
    prepare: (open) => open.evaluate((chosen) => document.querySelector('mh-app').controller.setGrouping(chosen), grouping),
  });
  // that it is an example says nothing to who looks at the store
  await page.evaluate(() => {
    const walk = (root) => {
      for (const element of root.querySelectorAll('*')) {
        if (element.localName === 'mh-chip' && /example/i.test(element.textContent)) element.remove();
        if (element.shadowRoot) walk(element.shadowRoot);
      }
    };
    walk(document);
  });
  const picture = (await page.screenshot()).toString('base64');
  await page.context().close();
  return `data:image/png;base64,${picture}`;
}

const html = (tablet, laptop) => `<!doctype html><meta charset="utf-8"><style>
  * { box-sizing: border-box; }
  body { margin: 0; width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; position: relative; background: linear-gradient(160deg, #35563a 0%, #23402c 55%, #16302a 100%); }
  img { display: block; width: 100%; }
  .light { position: absolute; border-radius: 50%; filter: blur(2px); }
  .laptop { position: absolute; left: 352px; top: 64px; width: 580px; }
  .lid { background: #23282a; border-radius: 22px 22px 0 0; padding: 13px 13px 15px; box-shadow: 0 30px 70px rgba(8, 30, 14, .32); }
  .lid img { border-radius: 10px; }
  .base { height: 20px; margin: 0 -38px; border-radius: 3px 3px 18px 18px; background: linear-gradient(#cdd3d0, #9aa39f); box-shadow: 0 22px 30px rgba(8, 30, 14, .3); }
  .tablet { position: absolute; left: 48px; top: 262px; width: 600px; background: #15181a; border-radius: 34px; padding: 16px; box-shadow: 0 40px 80px rgba(8, 30, 14, .34), 0 6px 18px rgba(8, 30, 14, .25), inset 0 0 0 2px #2a2f31; }
  .tablet img { border-radius: 20px; }
</style>
<div class="light" style="width:560px;height:560px;left:-150px;top:-190px;background:#4f8a5555"></div>
<div class="light" style="width:460px;height:460px;right:-120px;bottom:-160px;background:#a7d7a022"></div>
<div class="laptop"><div class="lid"><img src="${laptop}"></div><div class="base"></div></div>
<div class="tablet"><img src="${tablet}"></div>`;

await withBrowser(async (browser) => {
  const body = html(await dashboard(browser, 'zone'), await dashboard(browser, 'type'));
  for (const [name, scale] of Object.entries(SIZES)) {
    const context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: scale });
    const page = await context.newPage();
    await page.setContent(body);
    await page.waitForFunction(() => [...document.images].every((image) => image.complete && image.naturalWidth > 0));
    await page.screenshot({ path: at(`../homey-app/assets/images/${name}.png`) });
    await context.close();
  }
});
