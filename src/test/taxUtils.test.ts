import { describe, it, expect } from 'vitest';
import { calcLineTax, applyRounding } from '../lib/taxUtils';

describe('calcLineTax', () => {
  describe('EXCLUSIVE tax', () => {
    it('calculates tax correctly for 18% exclusive', () => {
      const result = calcLineTax(100, 18, 'EXCLUSIVE');
      expect(result.taxableValue).toBeCloseTo(100);
      expect(result.taxAmount).toBeCloseTo(18);
      expect(result.netAmount).toBeCloseTo(118);
    });

    it('calculates tax correctly for 5% exclusive', () => {
      const result = calcLineTax(200, 5, 'EXCLUSIVE');
      expect(result.taxableValue).toBeCloseTo(200);
      expect(result.taxAmount).toBeCloseTo(10);
      expect(result.netAmount).toBeCloseTo(210);
    });
  });

  describe('INCLUSIVE tax', () => {
    it('back-calculates taxable value for 18% inclusive', () => {
      const result = calcLineTax(118, 18, 'INCLUSIVE');
      expect(result.taxableValue).toBeCloseTo(100);
      expect(result.taxAmount).toBeCloseTo(18);
      expect(result.netAmount).toBeCloseTo(118);
    });

    it('back-calculates taxable value for 5% inclusive', () => {
      const result = calcLineTax(210, 5, 'INCLUSIVE');
      expect(result.taxableValue).toBeCloseTo(200);
      expect(result.taxAmount).toBeCloseTo(10);
      expect(result.netAmount).toBeCloseTo(210);
    });
  });

  describe('zero / NONE tax', () => {
    it('returns zero tax for zero rate', () => {
      const result = calcLineTax(500, 0, 'EXCLUSIVE');
      expect(result.taxableValue).toBe(500);
      expect(result.taxAmount).toBe(0);
      expect(result.netAmount).toBe(500);
    });

    it('returns zero tax when taxType is NONE', () => {
      const result = calcLineTax(500, 18, 'NONE');
      expect(result.taxableValue).toBe(500);
      expect(result.taxAmount).toBe(0);
      expect(result.netAmount).toBe(500);
    });
  });
});

describe('applyRounding', () => {
  it('rounds to nearest integer when enabled', () => {
    expect(applyRounding(99.4, true)).toBe(99);
    expect(applyRounding(99.6, true)).toBe(100);
  });

  it('returns unchanged amount when rounding is disabled', () => {
    expect(applyRounding(99.6, false)).toBeCloseTo(99.6);
  });

  it('rounds to a custom interval when provided', () => {
    // Round to nearest 5
    expect(applyRounding(13, true, 5)).toBe(15);
    expect(applyRounding(12, true, 5)).toBe(10);
  });
});
