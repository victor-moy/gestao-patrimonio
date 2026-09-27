/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  // isolatedModules: o type-checking completo do ts-jest trava (heap OOM) ao
  // resolver os tipos genéricos do @anthropic-ai/sdk + zod/v4 (módulo do
  // assistente de IA). A checagem de tipo "de verdade" já roda via
  // `npx tsc --noEmit`; aqui só precisamos da transpilação.
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { isolatedModules: true }],
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/server.ts',
    '!src/lib/prisma.ts',
  ],
  coverageThreshold: {
    global: {
      lines: 75,
    },
  },
};
