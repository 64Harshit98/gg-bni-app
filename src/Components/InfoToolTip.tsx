import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { FiInfo } from 'react-icons/fi';

interface InfoTooltipProps {
  text: string;
}

export const InfoTooltip: React.FC<InfoTooltipProps> = ({ text }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const [align, setAlign] = useState<'center' | 'left' | 'right'>('center');
  const iconRef = useRef<HTMLDivElement>(null);

  const updatePosition = () => {
    if (iconRef.current) {
      const rect = iconRef.current.getBoundingClientRect();
      const screenWidth = window.innerWidth;
      
      // Constants for tooltip sizing (approximate)
      const TOOLTIP_WIDTH_HALF = 100; // Half of w-48 (192px)

      let newLeft = rect.left + rect.width / 2;
      let newAlign: 'center' | 'left' | 'right' = 'center';

      // 1. Check Right Edge Collision
      if (rect.right + TOOLTIP_WIDTH_HALF > screenWidth - 10) {
        newAlign = 'right';
        newLeft = rect.right; // Anchor to the right edge of the icon
      } 
      // 2. Check Left Edge Collision
      else if (rect.left - TOOLTIP_WIDTH_HALF < 10) {
        newAlign = 'left';
        newLeft = rect.left; // Anchor to the left edge of the icon
      }

      setCoords({
        top: rect.top - 8, // 8px buffer above the icon
        left: newLeft,
      });
      setAlign(newAlign);
    }
  };

  const handleMouseEnter = () => {
    updatePosition();
    setIsVisible(true);
  };

  // Helper: Shift the tooltip box based on alignment
  const getTransform = () => {
    switch (align) {
        case 'left': return 'translate(0, -100%)'; // Box starts at anchor, extends right
        case 'right': return 'translate(-100%, -100%)'; // Box ends at anchor, extends left
        default: return 'translate(-50%, -100%)'; // Box centered on anchor
    }
  };

  // Helper: Move the arrow so it always points to the icon
  const getArrowClass = () => {
      switch (align) {
          case 'left': return 'left-2'; // Arrow on the left side
          case 'right': return 'right-2'; // Arrow on the right side
          default: return 'left-1/2 -translate-x-1/2'; // Arrow in the center
      }
  };

  return (
    <>
      <div 
        ref={iconRef}
        className="relative inline-flex items-center ml-2"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={() => setIsVisible(false)}
      >
        <FiInfo className="text-gray-400 hover:text-blue-500 cursor-help transition-colors" size={16} />
      </div>

      {isVisible && createPortal(
        <div 
          className="fixed z-[9999] w-48 p-2 bg-gray-800 text-white text-xs rounded shadow-lg text-center pointer-events-none animate-in fade-in zoom-in duration-200"
          style={{
            top: coords.top,
            left: coords.left,
            transform: getTransform() 
          }}
        >
          {text}
          {/* Dynamic Arrow */}
          <div className={`absolute top-full border-4 border-transparent border-t-gray-800 ${getArrowClass()}`}></div>
        </div>,
        document.body
      )}
    </>
  );
};