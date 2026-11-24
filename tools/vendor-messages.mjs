// The messages of `npm run vendor` (tools/fetch-vendor.mjs), apart so they can be tested.

/**
 * What to tell when downloading Athom's library failed before an answer came: fetch only fails like that when
 * there is no network, so the advice is the same for every such error.
 * @param {unknown} _error
 * @returns {string}
 */
export function describeDownloadError(_error) {
  return "Could not download Athom's library. Check the internet connection and run `npm run vendor` again.";
}
