import '@testing-library/jest-dom';
import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// O Node 26 expõe um localStorage experimental indefinido que encobre o
// do jsdom — usa um polyfill em memória nos testes.
function criarStorage(): Storage {
  const dados = new Map<string, string>();
  return {
    get length() {
      return dados.size;
    },
    clear: () => dados.clear(),
    getItem: (chave: string) => dados.get(chave) ?? null,
    setItem: (chave: string, valor: string) => void dados.set(chave, String(valor)),
    removeItem: (chave: string) => void dados.delete(chave),
    key: (indice: number) => Array.from(dados.keys())[indice] ?? null,
  };
}

Object.defineProperty(globalThis, 'localStorage', {
  value: criarStorage(),
  writable: true,
  configurable: true,
});

// Recharts (ResponsiveContainer) exige ResizeObserver, ausente no jsdom
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = globalThis.ResizeObserver ?? (ResizeObserverStub as never);

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
