import { expect, test } from 'vitest';
import { describeDownloadError } from '../../tools/vendor-messages.mjs';

test('without internet, npm run vendor says what to do', () => {
  expect(describeDownloadError(new TypeError('fetch failed'))).toBe("Could not download Athom's library. Check the internet connection and run `npm run vendor` again.");
});

test('any other failure while downloading says the same plain thing', () => {
  expect(describeDownloadError(new Error('socket hang up'))).toBe("Could not download Athom's library. Check the internet connection and run `npm run vendor` again.");
  expect(describeDownloadError('weird')).toBe("Could not download Athom's library. Check the internet connection and run `npm run vendor` again.");
});
