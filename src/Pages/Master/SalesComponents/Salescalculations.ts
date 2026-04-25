import { FiDelete } from 'react-icons/fi';
import type { CalcKey } from './Salestypes';

// ─── Rounding & Currency ──────────────────────────────────────────────────────

export const applyRounding = (
    amount: number,
    isRoundingEnabled: boolean,
    interval: number = 1
): number => {
    if (!isRoundingEnabled || !interval || interval <= 0) {
        return parseFloat(amount.toFixed(2));
    }
    const rounded = Math.round(amount / interval) * interval;
    return parseFloat(rounded.toFixed(2));
};

export const toCurrency = (num: number): number => {
    return Math.round((num + Number.EPSILON) * 100) / 100;
};

// ─── Calculator Keypad Layout ─────────────────────────────────────────────────

export const calcKeys: CalcKey[][] = [
    // Row 1: %, -, delete
    [
        { label: '%',  value: '%',         type: 'operator',  colClass: 'col-span-2' },
        { label: '-',  value: '-',         type: 'operator',  colClass: 'col-span-2' },
        { label: '',   value: 'Backspace', type: 'function',  icon: FiDelete, colClass: 'col-span-4' },
    ],
    // Row 2: 1, 2, 3, ×
    [
        { label: '1',  value: '1',  type: 'number',   colClass: 'col-span-2' },
        { label: '2',  value: '2',  type: 'number',   colClass: 'col-span-2' },
        { label: '3',  value: '3',  type: 'number',   colClass: 'col-span-2' },
        { label: '×',  value: '*',  type: 'operator', colClass: 'col-span-2' },
    ],
    // Row 3: 4, 5, 6, +
    [
        { label: '4',  value: '4',  type: 'number',   colClass: 'col-span-2' },
        { label: '5',  value: '5',  type: 'number',   colClass: 'col-span-2' },
        { label: '6',  value: '6',  type: 'number',   colClass: 'col-span-2' },
        { label: '+',  value: '+',  type: 'operator', colClass: 'col-span-2' },
    ],
    // Row 4: 7, 8, 9, .
    [
        { label: '7',  value: '7',  type: 'number',   colClass: 'col-span-2' },
        { label: '8',  value: '8',  type: 'number',   colClass: 'col-span-2' },
        { label: '9',  value: '9',  type: 'number',   colClass: 'col-span-2' },
        { label: '.',  value: '.',  type: 'number',   colClass: 'col-span-2' },
    ],
    // Row 5: 0, 00
    [
        { label: '0',  value: '0',  type: 'number',   colClass: 'col-span-4' },
        { label: '00', value: '00', type: 'number',   colClass: 'col-span-4' },
    ],
];