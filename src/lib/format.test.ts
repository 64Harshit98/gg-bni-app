import { describe, it, expect } from 'vitest';
import { formatClockTime, formatDayLabel, formatDayTime } from './format';

const now = new Date(2026, 10, 2, 12, 0);

describe('formatDayLabel', () => {
    it('names today and yesterday, whatever the time of day', () => {
        expect(formatDayLabel(new Date(2026, 10, 2, 0, 1), now)).toBe('Today');
        expect(formatDayLabel(new Date(2026, 10, 1, 23, 59), now)).toBe('Yesterday');
    });

    it('shows day and month for older dates this year', () => {
        expect(formatDayLabel(new Date(2026, 8, 26, 14, 46), now)).toBe('26 Sep');
    });

    it('adds the year for another year', () => {
        expect(formatDayLabel(new Date(2025, 11, 31, 9, 0), now)).toBe('31 Dec 2025');
    });
});

describe('formatDayTime', () => {
    it('joins the day label and the clock time', () => {
        const date = new Date(2026, 8, 26, 14, 46);
        expect(formatClockTime(date)).toBe('2:46 pm');
        expect(formatDayTime(date, now)).toBe('26 Sep, 2:46 pm');
    });
});
