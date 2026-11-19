import { describe, it, expect } from 'vitest';
import { isCloseLabel, isCloseText, isXPath } from './escToClose';

describe('close button detection', () => {
    it('reads close labels', () => {
        expect(isCloseLabel('Close')).toBe(true);
        expect(isCloseLabel('close dialog')).toBe(true);
        expect(isCloseLabel('Dismiss')).toBe(true);
        expect(isCloseLabel('Closed orders')).toBe(false);
        expect(isCloseLabel('Remove item')).toBe(false);
        expect(isCloseLabel(undefined)).toBe(false);
    });

    it('reads close button text exactly', () => {
        expect(isCloseText(' Cancel ')).toBe(true);
        expect(isCloseText('Close')).toBe(true);
        expect(isCloseText('✕')).toBe(true);
        expect(isCloseText('Cancel order')).toBe(false);
        expect(isCloseText('Save')).toBe(false);
    });

    it('spots a drawn ✕ icon', () => {
        expect(isXPath('M6 18L18 6M6 6l12 12')).toBe(true);
        expect(isXPath('M18 6 6 18M6 6l12 12')).toBe(true);
        expect(isXPath('M12 5v14M5 12h14')).toBe(false); // plus icon
    });
});
