import { useState } from 'react';
import { emailFormatError, emailSuggestion, emailTypingError, newEmailError } from './email';

/**
 * Live feedback for an email field. Definite mistakes show as they are typed;
 * anything still being typed waits until the person leaves the field.
 * Once shown, an error follows the typing and clears as soon as it is fixed.
 *
 * `newAccount`: the address is about to become a login, so endings that don't
 * exist are errors too. Leave it off on log in and reset, where the account
 * may already use one.
 */
export const useEmailCheck = (value: string, { newAccount = false } = {}) => {
  const email = value.trim();
  const [revealed, setRevealed] = useState(false);
  const [leftValue, setLeftValue] = useState<string | null>(null);
  const [heldValue, setHeldValue] = useState<string | null>(null);

  const problem = newAccount ? newEmailError(email) : emailFormatError(email);
  if (revealed && (!problem || !email)) setRevealed(false);

  const reveal = () => {
    setRevealed(true);
    setLeftValue(email);
  };

  // Shown only after leaving the field, or "a@gmail.co" flashes a hint on the way to .com
  const typo = emailSuggestion(email);
  const suggestion = leftValue === email ? typo : null;

  return {
    error: !email ? null : revealed ? problem : emailTypingError(email),
    suggestion,
    held: heldValue === email && suggestion !== null,
    valid: newAccount && !problem && !typo,
    onBlur: reveal,
    reveal,
    /**
     * Call on submit. True the first time an address has a likely typo, so the
     * form stops and shows it. Submitting again goes ahead, as it may be correct.
     */
    holdForTypo: () => {
      if (!typo || heldValue === email) return false;
      setHeldValue(email);
      return true;
    },
  };
};

export type EmailCheck = ReturnType<typeof useEmailCheck>;
