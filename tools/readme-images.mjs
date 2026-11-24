// The pictures of the readme: the built dashboard with the example house.
// Run `npm run build` first, then `npm run readme-images`.
import { at, houseOn, withBrowser } from './pictures.mjs';

const save = async (page, name) => {
  await page.screenshot({ path: at(`../docs/images/${name}.png`) });
  await page.context().close();
};
const toRooms = (page) => page.locator('mh-rail, mh-nav-bar').getByRole('button', { name: 'Rooms' }).click();

await withBrowser(async (browser) => {
  await save(await houseOn(browser, { width: 1440, height: 960, prepare: (page) => page.evaluate(() => document.querySelector('mh-app').controller.setGrouping('zone')) }), 'dashboard');
  await save(await houseOn(browser, { width: 390, height: 844, scale: 2, touch: true }), 'phone');
  await save(await houseOn(browser, { width: 390, height: 844, scale: 2, touch: true, scheme: 'dark', prepare: toRooms }), 'phone-rooms');
  await save(await houseOn(browser, { width: 1280, height: 800, prepare: (page) => page.evaluate(() => document.querySelector('mh-app').wall.preview('day')) }), 'rest');
});
