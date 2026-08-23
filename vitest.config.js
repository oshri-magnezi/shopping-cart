import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // jsdom supplies localStorage for the storage tests; everything else here
    // is pure functions and would run fine without it.
    environment: 'jsdom',
    include: ['src/**/*.test.js'],
  },
});
