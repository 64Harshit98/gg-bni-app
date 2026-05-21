import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock Firebase so the tests never hit a real Firestore instance
// ---------------------------------------------------------------------------
vi.mock('../lib/Firebase', () => ({
  db: {},
}));

vi.mock('firebase/firestore', () => {
  const mockGet = vi.fn();

  const mockTransaction = {
    get: mockGet,
    set: vi.fn(),
  };

  return {
    doc: vi.fn((_db: any, ...segments: string[]) => ({ path: segments.join('/') })),
    runTransaction: vi.fn(async (_db: any, fn: (tx: any) => Promise<any>) => fn(mockTransaction)),
    getDoc: vi.fn(),
  };
});

import { peekNextInvoiceNumber, incrementInvoiceCounter, OrderInvoiceNumber } from '../UseComponents/InvoiceCounter';
import { runTransaction, getDoc } from 'firebase/firestore';

const mockRunTransaction = vi.mocked(runTransaction);
const mockGetDoc = vi.mocked(getDoc);

beforeEach(() => {
  vi.clearAllMocks();
  capturedTransactionFn = null;
});

// ---------------------------------------------------------------------------
// peekNextInvoiceNumber
// ---------------------------------------------------------------------------
describe('peekNextInvoiceNumber', () => {
  it('returns INV-1 for a brand-new company (no counter doc)', async () => {
    mockGetDoc
      .mockResolvedValueOnce({ exists: () => false } as any) // settings
      .mockResolvedValueOnce({ exists: () => false } as any); // counter

    const result = await peekNextInvoiceNumber('company-001');
    expect(result).toBe('INV-1');
  });

  it('uses the prefix from sales-settings', async () => {
    mockGetDoc
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ voucherPrefix: 'BILL' }) } as any)
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ currentNumber: 42 }) } as any);

    const result = await peekNextInvoiceNumber('company-001');
    expect(result).toBe('BILL-42');
  });
});

// ---------------------------------------------------------------------------
// incrementInvoiceCounter
// ---------------------------------------------------------------------------
describe('incrementInvoiceCounter', () => {
  it('increments from the current counter value', async () => {
    const mockTx = {
      get: vi.fn().mockResolvedValue({
        exists: () => true,
        data: () => ({ currentNumber: 9 }),
      }),
      set: vi.fn(),
    };

    mockRunTransaction.mockImplementation(async (_db: any, fn: any) => fn(mockTx));

    await incrementInvoiceCounter('company-001');

    expect(mockTx.set).toHaveBeenCalledWith(
      expect.anything(),
      { currentNumber: 10 },
      { merge: true }
    );
  });
});

// ---------------------------------------------------------------------------
// OrderInvoiceNumber
// ---------------------------------------------------------------------------
describe('OrderInvoiceNumber', () => {
  it('throws for an empty companyId', async () => {
    await expect(OrderInvoiceNumber('')).rejects.toThrow();
  });

  it('starts at ORD-1001 for a new company', async () => {
    const mockTx = {
      get: vi.fn().mockResolvedValue({ exists: () => false }),
      set: vi.fn(),
    };

    mockRunTransaction.mockImplementation(async (_db: any, fn: any) => fn(mockTx));

    const result = await OrderInvoiceNumber('company-001');
    expect(result).toBe('ORD-1001');
  });

  it('pads the number to 4 digits', async () => {
    const mockTx = {
      get: vi.fn().mockResolvedValue({
        exists: () => true,
        data: () => ({ currentNumber: 1009 }),
      }),
      set: vi.fn(),
    };

    mockRunTransaction.mockImplementation(async (_db: any, fn: any) => fn(mockTx));

    const result = await OrderInvoiceNumber('company-001');
    expect(result).toBe('ORD-1010');
  });
});
