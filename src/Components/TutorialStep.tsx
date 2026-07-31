import React, { useRef, useEffect, useState, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
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
    let frame: number;
    let elapsed = 0;
    const loop = () => {
      updateRect();
      elapsed += 16;
      if (elapsed < 1000) {
        frame = requestAnimationFrame(loop);
      }
    };
    frame = requestAnimationFrame(loop);
    const timeout = setTimeout(() => updateRect(), 50);
    window.addEventListener("scroll", updateRect, true);
    window.addEventListener("resize", updateRect);
    return () => {
      cancelAnimationFrame(frame);
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
    const tooltipWidth = 256;
    const gap = 12;
    const margin = 8;

    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;

    // Prefer requested position, but flip if there isn't enough room
    let placeBelow = position !== 'top';
    if (placeBelow && spaceBelow < tooltipHeight + gap && spaceAbove > spaceBelow) {
      placeBelow = false;
    } else if (!placeBelow && spaceAbove < tooltipHeight + gap && spaceBelow > spaceAbove) {
      placeBelow = true;
    }

    let top = placeBelow ? rect.bottom + gap : rect.top - tooltipHeight - gap;
    // Clamp vertically inside the viewport
    top = Math.min(Math.max(top, margin), window.innerHeight - tooltipHeight - margin);

    let left = Math.max(rect.right - tooltipWidth, margin);
    // Clamp horizontally inside the viewport
    left = Math.min(left, window.innerWidth - tooltipWidth - margin);

    return { top, left, placeBelow };
  };
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const computedArrowAlign = isMobile ? mobileArrowAlign : arrowAlign;

  return (
    <>
      <div ref={wrapperRef} style={{ display: "contents" }}>
        {children}
      </div>

      {isActive && rect && createPortal(
        <>
          {/* ✅ NEW: Invisible Shield to block ALL clicks from reaching the highlighted element */}
          <div
            className="fixed inset-0 z-[9998] pointer-events-auto"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          />

          {/* Overlay (Visually unchanged, but pointer events pass through to the shield) */}
          <div
            className="fixed inset-0 z-[9998] pointer-events-none"
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
          {(() => {
            const { top, left, placeBelow } = getTooltipStyle(rect);
            return (
              <div
                className="fixed z-[9999] bg-card rounded-sm shadow-xl p-4 w-64"
                style={{ top, left }}
              >
                {!placeBelow ? (
                  <div className={`absolute -bottom-2 ${computedArrowAlign === 'left' ? 'left-6' : 'right-6'} w-4 h-4 bg-card border-r border-b border-border rotate-45`} />
                ) : (
                  <div className={`absolute -top-2 ${computedArrowAlign === 'left' ? 'left-6' : 'right-6'} w-4 h-4 bg-card border-l border-t border-border rotate-45`} />
                )}

                <p className="text-sm font-medium text-foreground mb-3">{text}</p>
                <div className="flex justify-between items-center">
                  <button onClick={onSkip} className="text-xs text-muted-foreground hover:text-muted-foreground">
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
            );
          })()}
        </>,
        document.body
      )}
    </>
  );
};