import React from 'react';
import type { EmailCheck } from '../lib/useEmailCheck';

interface EmailSuggestionProps {
  check: EmailCheck;
  onUse: (email: string) => void;
  /** Colour of the suggested address. */
  linkClassName?: string;
}

/** "Did you mean a@gmail.com?" The address is a button that puts it in the field. */
export const EmailSuggestion: React.FC<EmailSuggestionProps> = ({ check, onUse, linkClassName = 'text-blue-700' }) => {
  if (!check.suggestion) return null;
  const suggestion = check.suggestion;
  return (
    <span className={check.error ? undefined : 'text-amber-800'}>
      Did you mean{' '}
      <button
        type="button"
        onClick={() => onUse(suggestion)}
        className={`break-all rounded-sm font-medium underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${linkClassName}`}
      >
        {suggestion}
      </button>
      ?{check.held && ' If yours is right, continue again.'}
    </span>
  );
};
