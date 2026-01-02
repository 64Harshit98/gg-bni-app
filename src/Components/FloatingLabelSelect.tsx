import React from 'react';
import { cn } from '../lib/utils'; // Assuming you have this util

// Define the props
interface FloatingLabelSelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  options: { value: string; label: string }[] | string[];
  icon?: React.ReactNode;
}

export const FloatingLabelSelect = React.forwardRef<
  HTMLSelectElement,
  FloatingLabelSelectProps
>(({ className, label, id, options, icon, value, ...props }, ref) => {
  const inputId = id || label.replace(/\s+/g, '-').toLowerCase();
  // We use React state to check for a value, since <select> doesn't have a placeholder
  const hasValue = Boolean(value);

  return (
    <div className="relative">
      {icon && (
        // Icon is centered vertically
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 z-10">
          {icon}
        </div>
      )}
      <select
        id={inputId}
        ref={ref}
        value={value}
        className={cn(
          // Base styles from FloatingLabelInput
          'peer h-14 w-full text-base bg-transparent rounded-sm border border-gray-500 focus:outline-none focus:border-2 border-gray-500',
          // Padding adjusts for icon
          icon ? 'pl-10 pr-3' : 'px-3',
          className,
        )}
        {...props}
      >
        {/* Empty option allows the label to float correctly when nothing is selected */}
        <option value="" disabled hidden></option>
        {options.map((opt) => {
          const val = typeof opt === 'string' ? opt : opt.value;
          const lbl = typeof opt === 'string' ? opt : opt.label;
          return (
            <option key={val} value={val} className="text-black">
              {lbl}
            </option>
          );
        })}
      </select>
      <label
        htmlFor={inputId}
        className={cn(
          'absolute pointer-events-none bg-gray-100 px-1 transition-all duration-200 ease-out origin-[0]',
          
          // --- LOGIC FIX START ---
          // When floated (hasValue or focus): Always reset left position to align with border
          // When inside (no value): If icon exists, push left to avoid overlap.
          
          hasValue 
            ? '-top-2.5 left-3 scale-90 text-sm text-gray-600' 
            : icon 
                ? 'top-4 left-10 text-base text-gray-600' // Push right if icon exists
                : 'top-4 left-3 text-base text-gray-600',

          // Peer Focus State (Always float to top)
          'peer-focus:-top-2.5 peer-focus:left-3 peer-focus:scale-90 peer-focus:text-sm peer-focus:text-gray-600'
          // --- LOGIC FIX END ---
        )}
      >
        {label}
        {props.required && <span className="text-red-500">*</span>}
      </label>
    </div>
  );
});

FloatingLabelSelect.displayName = 'FloatingLabelSelect';
