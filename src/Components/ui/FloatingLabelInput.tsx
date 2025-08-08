import React from 'react';
import { cn } from '../../lib/utils';
import { Input } from './input';

interface FloatingLabelInputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

const FloatingLabelInput = React.forwardRef<
  HTMLInputElement,
  FloatingLabelInputProps
>(({ className, label, id, ...props }, ref) => {
  const inputId = id || label.replace(/\s+/g, '-').toLowerCase();

  return (
    <div className="relative">
      <Input
        id={inputId}
        className={cn(
          'peer h-14 placeholder-transparent rounded-xs border-2 border-black',
          className,
        )}
        placeholder=" "
        ref={ref}
        {...props}
      />
      <label
        htmlFor={inputId}
        className="absolute pointer-events-none left-3 -top-2.5 text-sm text-gray-600 bg-white px-1 transition-all peer-placeholder-shown:top-4 peer-placeholder-shown:text-base peer-focus:-top-2.5 peer-focus:text-sm"
      >
        {label}
        {props.required && <span className="text-red-500">*</span>}
      </label>
    </div>
  );
});

FloatingLabelInput.displayName = 'FloatingLabelInput';

export { FloatingLabelInput };
