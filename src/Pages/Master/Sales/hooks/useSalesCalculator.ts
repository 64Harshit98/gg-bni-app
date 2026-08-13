import { useState, useEffect, useRef } from 'react';
import { State } from '../../../../enums';
import type { SalesItem } from '../sales.types';

// Moved verbatim from Sales.tsx (was declared at module scope, just above
// the component). Exported so both the hook (function signatures) and
// Sales.tsx (the `calcKeys` keypad-layout constant + JSX) can share it.
export interface CalcKey {
    label: string;
    value: string;
    type: 'number' | 'operator' | 'function';
    icon?: React.ElementType;
    colClass?: string; // <--- Changed from colspan to colClass
}

interface UseSalesCalculatorParams {
    items: SalesItem[];
    setItems: React.Dispatch<React.SetStateAction<SalesItem[]>>;
    salesSettings: any;
    setModal: (modal: { message: string; type: State } | null) => void;
    isCalculatorView: boolean;
    setIsDrawerOpen: (open: boolean) => void;
    longPressTimer: React.MutableRefObject<NodeJS.Timeout | null>;
    finalAmount: number;
}

// Owns the calculator-view subsystem — moved verbatim from Sales.tsx: the
// calcInput/stagedCalcInput state (+ the "forget staged equation when cart
// empties" effect), the equation-parsing helpers (insertAtCursor,
// deleteAtCursor, generateSafeId, evaluateSegmentNoPercent,
// evaluateMultiplication, parseFullEquation), the live-preview derived
// values (parsedData/liveTotal/liveItemCount), handleKeypadPress,
// handlePointerDown/Up/Leave (sharing the single `longPressTimer` ref that
// also drives the cart's discount/price long-press-to-unlock — passed in
// from useSalesCart rather than duplicated), handleCheckoutClick, and the
// global keyboard-listener effect. This subsystem is Sales-specific and has
// no equivalent in Orders/Journal.
export const useSalesCalculator = ({
    items,
    setItems,
    salesSettings,
    setModal,
    isCalculatorView,
    setIsDrawerOpen,
    longPressTimer,
    finalAmount,
}: UseSalesCalculatorParams) => {
    const [calcInput, setCalcInput] = useState<string>('');
    const [stagedCalcInput, setStagedCalcInput] = useState<string>('');
    const displayRef = useRef<HTMLTextAreaElement>(null);

    // If the cart gets completely cleared (e.g., successful payment), forget the staged equation
    useEffect(() => {
        if (items.length === 0) {
            setStagedCalcInput('');
        }
    }, [items.length]);

    const handlePointerDown = (key: CalcKey) => {
        if (key.value === 'Backspace') {
            longPressTimer.current = setTimeout(() => {
                handleKeypadPress({ ...key, value: 'Clear' }); // Triggers the Clear logic after 1.5s
                longPressTimer.current = null;
            }, 1000);
        }
    };

    const handlePointerUp = (key: CalcKey) => {
        if (key.value === 'Backspace') {
            if (longPressTimer.current) {
                clearTimeout(longPressTimer.current); // Cancel the long press
                handleKeypadPress(key); // Execute normal short press (Backspace)
                longPressTimer.current = null;
            }
        } else {
            handleKeypadPress(key); // Normal keys execute on click/up
        }
    };

    const handlePointerLeave = (key: CalcKey) => {
        if (key.value === 'Backspace' && longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
    };

    // Injects a number exactly where the user tapped
    const insertAtCursor = (val: string) => {
        const input = displayRef.current;
        if (!input) {
            setCalcInput(prev => prev + val);
            return;
        }

        // Capture cursor position *before* the state updates
        const start = input.selectionStart ?? 0;
        const end = input.selectionEnd ?? 0;
        // Detect if the user is typing at the very end of the visible text
        const isAtEnd = start === (input.value?.length || 0);

        setCalcInput(prev => {
            const currentInput = prev || '';

            // If typing rapidly at the end, safely append. Otherwise, insert at cursor.
            const newVal = isAtEnd
                ? currentInput + val
                : currentInput.slice(0, start) + val + currentInput.slice(end);

            setTimeout(() => {
                input.focus();
                const newPos = isAtEnd ? newVal.length : start + val.length;
                input.setSelectionRange(newPos, newPos);
            }, 0);

            return newVal;
        });
    };

    // Deletes the number exactly where the user tapped
    const deleteAtCursor = () => {
        const input = displayRef.current;
        if (!input) return;

        const start = input.selectionStart ?? 0;
        const end = input.selectionEnd ?? 0;
        const isAtEnd = start === (input.value?.length || 0);

        setCalcInput(prev => {
            if (!prev) return prev;

            let newVal;
            let newPos;

            // If rapid-firing backspace at the end of the string
            if (isAtEnd) {
                newVal = prev.slice(0, -1);
                newPos = newVal.length;
            } else if (start === end && start > 0) {
                newVal = prev.slice(0, start - 1) + prev.slice(end);
                newPos = start - 1;
            } else if (start !== end) {
                newVal = prev.slice(0, start) + prev.slice(end);
                newPos = start;
            } else {
                return prev; // Nothing to delete
            }

            setTimeout(() => {
                input.focus();
                input.setSelectionRange(newPos, newPos);
            }, 0);

            return newVal;
        });
    };

    const generateSafeId = () => {
        if (typeof window.crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            return crypto.randomUUID();
        }
        // Fallback for mobile HTTP testing
        return 'id-' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
    };
    // Evaluates expressions like "23*5", "36-5", "45*5-10", "36"
    // NO percentage handling here — that's done in parseFullEquation
    const evaluateSegmentNoPercent = (expr: string): number => {
        // Split by - to handle flat subtraction
        // But careful: "23*5-10" → base="23*5", subtract=10
        const subtractParts = expr.split('-');

        // First part may have multiplication
        let result = evaluateMultiplication(subtractParts[0]);

        // Remaining parts are subtracted flat
        for (let i = 1; i < subtractParts.length; i++) {
            const val = evaluateMultiplication(subtractParts[i]);
            if (!isNaN(val)) result -= val;
        }

        return result;
    };

    // Evaluates "23*5" or "100" — multiplication only
    const evaluateMultiplication = (expr: string): number => {
        const parts = expr.trim().split('*');
        let result = 1;
        let hasValid = false;

        parts.forEach(p => {
            const n = parseFloat(p.trim());
            if (!isNaN(n)) {
                result *= n;
                hasValid = true;
            }
        });

        return hasValid ? result : NaN;
    };
    // Parses the entire string on the screen to calculate live totals and generate items
    const parseFullEquation = (equation: string): { items: SalesItem[], total: number } => {
        if (!equation.trim()) return { items: [], total: 0 };

        // Split ONLY on + as separator (never treat + as addition)
        const segments = equation.split('+').map(s => s.trim()).filter(Boolean);

        const newItems: SalesItem[] = [];
        let grandTotal = 0;

        segments.forEach((segment) => {
            if (!segment.trim()) return;

            let segmentValue = 0;

            // Each segment can be:
            // "115"        → flat amount
            // "23*5"       → multiply
            // "36-5"       → flat subtract
            // "45*5-10"    → multiply then flat subtract
            // "20-2%"      → multiply/flat then percentage discount
            // "45*3-10%"   → multiply then percentage discount

            // Step 1: Check for percentage discount at the END (e.g. "45*3-10%")
            const percentDiscountMatch = segment.match(/^(.+)-(\d+(?:\.\d+)?)%$/);

            if (percentDiscountMatch) {
                const baseExpr = percentDiscountMatch[1].trim();  // "45*3" or "20"
                const discountPct = parseFloat(percentDiscountMatch[2]); // 10 or 2

                // Evaluate base expression (may have * and -)
                // First handle multiplication, then subtraction
                let baseValue = evaluateSegmentNoPercent(baseExpr);
                if (!isNaN(baseValue)) {
                    segmentValue = baseValue * (1 - discountPct / 100);
                }
            } else {
                // No percentage — evaluate as flat expression with * and -
                segmentValue = evaluateSegmentNoPercent(segment);
            }

            if (!isNaN(segmentValue) && segmentValue !== 0) {
                newItems.push({
                    id: generateSafeId(),
                    productId: `${generateSafeId()}`,
                    name: segment.replace('*', ' x '),
                    mrp: segmentValue,
                    salesPrice: segmentValue,
                    customPrice: segmentValue,
                    quantity: 1,
                    discount: 0,
                    discount2: 0,
                    isEditable: true,
                    purchasePrice: 0,
                    tax: salesSettings?.defaultTaxRate || 0,
                    itemGroupId: 'calculator',
                    stock: 0,
                    amount: segmentValue,
                    barcode: '',
                    restockQuantity: 0,
                    unit: 'Bill',
                    unitMultiplier: 1,
                    packetSize: 1,
                    isCustomAmount: true,
                    isStagedCalcItem: false,
                });

                grandTotal += segmentValue;
            }
        });

        return { items: newItems, total: grandTotal };
    };

    // Live preview data
    const parsedData = parseFullEquation(calcInput);
    const liveTotal = finalAmount + parsedData.total;
    const liveItemCount = items.length + parsedData.items.length;


    const handleKeypadPress = (key: CalcKey) => {
        const { value, type } = key;
        if (type === 'function') {
            if (value === 'Backspace') {
                deleteAtCursor(); // <-- UPDATED
            } else if (value === 'Clear') {
                if (calcInput === '') {
                    if (items.length > 0 && window.confirm("Are you sure you want to clear the entire bill?")) setItems([]);
                } else {
                    setCalcInput('');
                }
            }
        } else {
            // Operator (+, *) or Number
            insertAtCursor(value); // <-- UPDATED
        }
    };

    const handleCheckoutClick = () => {
        if (calcInput.trim()) {
            // Flag the items as 'staged' so we can remove them if the drawer is canceled
            const stagedItems = parsedData.items.map(i => ({ ...i, isStagedCalcItem: true }));

            setStagedCalcInput(calcInput); // Remember the equation

            setItems(prev => {
                const insertionOrder = salesSettings?.cartInsertionOrder || 'top';
                return insertionOrder === 'top' ? [...stagedItems, ...prev] : [...prev, ...stagedItems];
            });
            setCalcInput(''); // Clear screen
        }

        setTimeout(() => {
            if (items.length > 0 || parsedData.items.length > 0) {
                setIsDrawerOpen(true);
            } else {
                setModal({ message: 'Please add at least one item.', type: State.INFO });
            }
        }, 10);
    };

    useEffect(() => {
        if (!isCalculatorView) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (document.activeElement === displayRef.current) {
                if (e.key === 'Enter' || e.key === '=') {
                    e.preventDefault();
                    handleCheckoutClick();
                } else if (e.key.toLowerCase() === 'c' || e.key === 'Escape') {
                    e.preventDefault();
                    if (calcInput === '') {
                        if (items.length > 0 && window.confirm("Are you sure you want to clear the bill?")) setItems([]);
                    } else {
                        setCalcInput('');
                    }
                }
                return;
            }
            const key = e.key;
            if (/^[0-9*.\-+]$/.test(key)) {
                setCalcInput(prev => prev + key);
            } else if (key === 'Enter' || key === '=') {
                e.preventDefault();
                handleCheckoutClick();
            } else if (key === 'Backspace') {
                setCalcInput(prev => prev.slice(0, -1));
            } else if (key.toLowerCase() === 'c' || key === 'Escape') {
                if (calcInput === '') {
                    if (items.length > 0 && window.confirm("Are you sure you want to clear the bill?")) setItems([]);
                } else {
                    setCalcInput('');
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isCalculatorView, calcInput, items.length]);

    return {
        calcInput, setCalcInput,
        stagedCalcInput, setStagedCalcInput,
        displayRef,
        handlePointerDown,
        handlePointerUp,
        handlePointerLeave,
        insertAtCursor,
        deleteAtCursor,
        parseFullEquation,
        parsedData,
        liveTotal,
        liveItemCount,
        handleKeypadPress,
        handleCheckoutClick,
    };
};
