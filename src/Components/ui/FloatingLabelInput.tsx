import React from 'react';
import { cn } from '../../lib/utils';
import { Input } from './input';

interface FloatingLabelInputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  onFill?: () => void;
  showFillButton?: boolean;
}

const FloatingLabelInput = React.forwardRef<
  HTMLInputElement,
  FloatingLabelInputProps
>(({ className, label, id, onFill, showFillButton, ...props }, ref) => {
  const inputId = id || label.replace(/\s+/g, '-').toLowerCase();

  return (
    <div className="relative">
      <Input
        id={inputId}
        className={cn(
          'peer h-14 placeholder-transparent rounded-sm border border-gray-500',
          className,
        )}
        placeholder=" "
        ref={ref}
        {...props}
      />
      <label
        htmlFor={inputId}
        className="absolute pointer-events-none left-3 -top-2.5 text-sm text-gray-600 bg-gray-100 px-1 transition-all peer-placeholder-shown:top-4 peer-placeholder-shown:text-base peer-focus:-top-2.5 peer-focus:text-sm"
      >
        {label}
        {props.required && <span className="text-red-500">*</span>}
      </label>
      {showFillButton && onFill && (
        <button
          onClick={onFill}
          className="absolute top-1/2 right-3 -translate-y-1/2 text-xs bg-blue-100 text-blue-700 font-semibold px-2 py-1 rounded-full hover:bg-blue-200"
        >
          Fill
        </button>
      )}
    </div>
  );
});

FloatingLabelInput.displayName = 'FloatingLabelInput';

export { FloatingLabelInput };
