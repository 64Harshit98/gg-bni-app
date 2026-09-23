import React, { useRef, useMemo, useCallback } from 'react';

interface CalcDisplayProps {
    value: string;
    containerWidth?: number;
    fontSize?: number;
}

const CalcDisplay: React.FC<CalcDisplayProps> = ({ 
    value, 
    containerWidth = 320, 
    fontSize = 48 
}) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    const measureWidth = useCallback((text: string): number => {
        if (!canvasRef.current) {
            canvasRef.current = document.createElement('canvas');
        }
        const ctx = canvasRef.current.getContext('2d');
        if (!ctx) return text.length * fontSize * 0.55;
        ctx.font = `300 ${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
        return ctx.measureText(text).width;
    }, [fontSize]);

    const { previousLines, currentLine } = useMemo(() => {
        const input = value || '';
        if (!input) return { previousLines: [], currentLine: '' };

        const builtLines: string[] = [];
        let current = '';

        for (const char of input) {
            const test = current + char;
            if (measureWidth(test) > containerWidth && current.length > 0) {
                builtLines.push(current);
                current = char;
            } else {
                current = test;
            }
        }
        builtLines.push(current);

        return {
            previousLines: builtLines.slice(0, -1),
            currentLine: builtLines[builtLines.length - 1] ?? '',
        };
    }, [value, measureWidth, containerWidth]);

    return (
        <div className="w-full flex flex-col items-end justify-end gap-0.5 overflow-hidden">
            {previousLines.map((line, idx) => {
                const opacity = Math.max(0.3, 0.55 - (previousLines.length - 1 - idx) * 0.12);
                const sizRem = Math.max(0.8, 1.05 - previousLines.length * 0.07);
                return (
                    <div
                        key={idx}
                        className="w-full text-right font-light tracking-wide leading-tight"
                        style={{ fontSize: `${sizRem}rem`, color: `rgba(100, 100, 120, ${opacity})` }}
                    >
                        {line}
                    </div>
                );
            })}
            <div
                className="w-full text-right font-light text-gray-800 tracking-wide leading-snug"
                style={{ fontSize: 'clamp(2rem, 10vw, 3rem)' }}
            >
                {currentLine || <span className="text-gray-300">0</span>}
            </div>
        </div>
    );
};

export default CalcDisplay;