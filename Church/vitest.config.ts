import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['sync/**/*.test.ts'],
    environment: 'node',
  },
});
