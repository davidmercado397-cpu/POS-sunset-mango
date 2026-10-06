import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
    fileParallelism: false,
    setupFiles: ['./test/setup-env.ts'],
  },
  // SWC emite la metadata de decoradores que necesita la inyección de dependencias de NestJS.
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
