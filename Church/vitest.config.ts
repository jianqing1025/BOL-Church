import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'sync/**/*.test.ts',
      'live/**/*.test.ts',
      'constants/**/*.test.ts',
      'components/**/*.test.ts',
      'meeting/**/*.test.ts',
      'services/**/*.test.ts',
      'mailbox/**/*.test.ts',
    ],
    environment: 'node',
  },
});
