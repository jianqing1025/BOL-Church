import { expect, it } from 'vitest';
import * as single from './index';
import * as multi from './saasWorker';

// The Workers runtime treats every export of a Worker's entry module as an entry
// point and will not start if one is, say, a string. Keep the entries bare.
it('the Worker entry modules export only what the runtime expects', () => {
  expect(Object.keys(single).sort()).toEqual(['default']);
  expect(Object.keys(multi).sort()).toEqual(['ChurchStore', 'default']);
});
