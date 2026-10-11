import { PrismaClient } from '@prisma/client';
import { DeepMockProxy, mockDeep, mockReset } from 'jest-mock-extended';

jest.mock('../src/lib/prisma', () => ({
  prisma: mockDeep<PrismaClient>(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
import { prisma } from '../src/lib/prisma';

export const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;

beforeEach(() => {
  mockReset(prismaMock);
  // Débitos condicionais (estoque e saldo de ata) afetam 1 linha por padrão;
  // os testes de corrida sobrescrevem com { count: 0 }.
  (prismaMock.estoqueGalpao.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
  (prismaMock.ata.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
  // $transaction com callback executa sobre o próprio mock
  (prismaMock.$transaction as jest.Mock).mockImplementation(async (arg: unknown) => {
    if (typeof arg === 'function') {
      return (arg as (tx: unknown) => Promise<unknown>)(prismaMock);
    }
    return Promise.all(arg as Array<Promise<unknown>>);
  });
});
