import { describe, expect, it } from 'vitest';
import type { SaleRecord } from '../SalesReportComponents/salesReport.utils';
import { buildCustomerRows } from './customerReport.utils';

const sale = (id: string, partyName: string, partyNumber: string) =>
  ({ id, partyName, partyNumber, invoiceNumber: id, totalAmount: 100, createdAt: 1 }) as unknown as SaleRecord;

const build = (sales: SaleRecord[], remarks?: { name: string; number: string; remark: string }[]) =>
  buildCustomerRows({ sales, openingBalances: [], newCustomers: [], credits: [], remarks });

describe('buildCustomerRows remarks', () => {
  it('attaches a remark to the customer with that phone, whatever name the bill carries', () => {
    const [row] = build([sale('a', 'Ramesh K', '9876543210')], [
      { name: 'Ramesh', number: '9876543210', remark: 'Prefers morning delivery' },
    ]);
    expect(row.remark).toBe('Prefers morning delivery');
  });

  it('does not give a remark to another customer who shares the name', () => {
    const [row] = build([sale('a', 'Ramesh', '9000000000')], [
      { name: 'Ramesh', number: '9876543210', remark: 'Prefers morning delivery' },
    ]);
    expect(row.remark).toBe('');
  });

  it('matches a customer without a phone by name, ignoring case', () => {
    const [row] = build([sale('a', 'ramesh', '')], [{ name: 'Ramesh', number: '', remark: 'Pays on Fridays' }]);
    expect(row.remark).toBe('Pays on Fridays');
  });

  it('leaves the remark empty when none are passed', () => {
    const [row] = build([sale('a', 'Ramesh', '9876543210')]);
    expect(row.remark).toBe('');
  });
});
