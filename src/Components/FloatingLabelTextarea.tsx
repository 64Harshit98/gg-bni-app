import React from 'react';
import { cn } from '../lib/utils'; // Assuming you have this util

// Define the props
interface FloatingLabelTextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  icon?: React.ReactNode;
}

export const FloatingLabelTextarea = React.forwardRef<
  HTMLTextAreaElement,
  FloatingLabelTextareaProps
>(({ className, label, id, icon, ...props }, ref) => {
  const inputId = id || label.replace(/\s+/g, '-').toLowerCase();

  return (
    <div className="relative">
      {icon && (
        // Icon is pinned to the top, aligned with the un-floated label
        <div className="absolute left-3 top-4 text-gray-400 z-10">
          {icon}
        </div>
      )}
      <textarea
        id={inputId}
        ref={ref}
        className={cn(
          // Base styles from FloatingLabelInput
          'peer w-full placeholder-transparent rounded-sm border border-gray-500 focus:outline-none focus:border-blue-500',
          // Padding adjusts for icon and label
          icon ? 'pl-10 pr-3' : 'px-3',
          'pt-4 pb-2', // Standard padding
          className,
        )}
        placeholder=" " // This is crucial for the peer-placeholder-shown to work
        rows={4} // A sensible default
        {...props}
      />
      <label
        htmlFor={inputId}
        className={cn(
          // Copied directly from your FloatingLabelInput, but with icon logic
          'absolute pointer-events-none bg-gray-100 px-1 transition-all',
          icon ? 'left-9' : 'left-3', // Adjust label based on icon
          '-top-2.5 text-sm text-gray-600', // Floated state
          'peer-placeholder-shown:top-4 peer-placeholder-shown:text-base', // Un-floated state
          'peer-focus:-top-2.5 peer-focus:text-sm peer-focus:text-blue-600', // Focus state
        )}
      >
        {label}
        {props.required && <span className="text-red-500">*</span>}
      </label>
    </div>
  );
});

FloatingLabelTextarea.displayName = 'FloatingLabelTextarea';
