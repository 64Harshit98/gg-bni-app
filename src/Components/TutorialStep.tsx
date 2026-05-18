import React, { useRef, useEffect, useState, useLayoutEffect } from "react";

interface Props {
  step: number;
  currentStep: number;
  text: string;
  onNext: () => void;
  onSkip: () => void;
  children: React.ReactNode;
  isLast?: boolean;
  position?: 'top' | 'bottom';
  arrowAlign?: 'left' | 'right';
  mobileArrowAlign?: 'left' | 'right';
}

export const TutorialStep: React.FC<Props> = ({
  step, currentStep, text, onNext, onSkip, children, isLast, position = 'bottom',
  arrowAlign = 'right',
  mobileArrowAlign = 'right',
}) => {
  const isActive = step === currentStep;
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const updateRect = () => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const firstChild = wrapper.firstElementChild as HTMLElement | null;
    const target = firstChild ?? wrapper;
    const r = target.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    setRect(r);
  };

  useLayoutEffect(() => {
    if (!isActive) return;
    const timeout = setTimeout(() => updateRect(), 50);
    window.addEventListener("scroll", updateRect, true);
    window.addEventListener("resize", updateRect);
    return () => {
      clearTimeout(timeout);
      window.removeEventListener("scroll", updateRect, true);
      window.removeEventListener("resize", updateRect);
    };
  }, [isActive]);

  useEffect(() => {
    if (isActive) updateRect();
  }, [isActive]);

  const getTooltipStyle = (rect: DOMRect) => {
    const tooltipHeight = 110;
    const gap = 12;

    const top = position === 'top'
      ? rect.top - tooltipHeight - gap
      : rect.bottom + gap;

    const left = Math.max(rect.right - 256, 8);

    return { top, left };
  };

  const isMobile = window.innerWidth < 768;
  const computedArrowAlign = isMobile ? mobileArrowAlign : arrowAlign;

  return (
    <>
      <div ref={wrapperRef} style={{ display: "contents" }}>
        {children}
      </div>

      {isActive && rect && (
        <>
          {/* ✅ NEW: Invisible Shield to block ALL clicks from reaching the highlighted element */}
          <div
            className="fixed inset-0 z-40 pointer-events-auto"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          />

          {/* Overlay (Visually unchanged, but pointer events pass through to the shield) */}
          <div
            className="fixed inset-0 z-40 pointer-events-none"
            style={{
              background: "rgba(0,0,0,0.55)",
              clipPath: `polygon(
                0% 0%, 
                100% 0%, 
                100% 100%, 
                0% 100%, 
                0% 0%, 
                ${rect.left - 4}px ${rect.top - 4}px, 
                ${rect.left - 4}px ${rect.bottom + 4}px, 
                ${rect.right + 4}px ${rect.bottom + 4}px, 
                ${rect.right + 4}px ${rect.top - 4}px, 
                ${rect.left - 4}px ${rect.top - 4}px
              )`,
            }}
          />

          {/* Tooltip */}
          <div
            className="fixed z-50 bg-white rounded-sm shadow-xl p-4 w-64"
            style={getTooltipStyle(rect)}
          >
            {position === 'top' ? (
              <div className={`absolute -bottom-2 ${computedArrowAlign === 'left' ? 'left-6' : 'right-6'} w-4 h-4 bg-white border-r border-b border-gray-100 rotate-45`} />
            ) : (
              <div className={`absolute -top-2 ${computedArrowAlign === 'left' ? 'left-6' : 'right-6'} w-4 h-4 bg-white border-l border-t border-gray-100 rotate-45`} />
            )}

            <p className="text-sm font-medium text-gray-800 mb-3">{text}</p>
            <div className="flex justify-between items-center">
              <button onClick={onSkip} className="text-xs text-gray-400 hover:text-gray-600">
                Skip tour
              </button>
              <button
                onClick={onNext}
                className="text-xs bg-blue-500 hover:bg-blue-600 text-white px-3 py-1.5 rounded-sm"
              >
                {isLast ? "Finish" : "Next →"}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
};