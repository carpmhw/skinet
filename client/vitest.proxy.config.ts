import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['server/**/*.spec.ts'], environment: 'node' }
});
