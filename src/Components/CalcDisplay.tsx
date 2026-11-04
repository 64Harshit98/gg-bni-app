import React from 'react';

interface CalcDisplayProps {
    value: string;
}

const OPERATORS = ['*', '+', '-', '%'];

const CalcDisplay: React.FC<CalcDisplayProps> = ({ value }) => {
    const input = value || '';
    const opIdx = Math.max(...OPERATORS.map(o => input.lastIndexOf(o)));

    // "60*3" -> expression "60 ×" (small) + current "3" (big)
    const expression = opIdx >= 0
        ? input.slice(0, opIdx + 1).replace(/\*/g, '×').replace(/-/g, '−')
        : '';
    const current = opIdx >= 0 ? input.slice(opIdx + 1) : input;

    return (
        <div className="w-full text-right">
            <div className="min-h-[20px] max-h-10 overflow-hidden flex flex-col justify-end text-sm leading-5 text-[#5b6b86] tabular-nums [overflow-wrap:anywhere]">
                {expression}
            </div>
            <div className="text-[44px] leading-[52px] font-semibold tracking-tight tabular-nums text-[#0f172b] [overflow-wrap:anywhere]">
                <i className="not-italic text-[26px] text-[#5b6b86] mr-1">₹</i>{current || '0'}
            </div>
        </div>
    );
};

export default CalcDisplay;