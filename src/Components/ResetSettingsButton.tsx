import React, { useState } from 'react';
import { Modal } from '../constants/Modal';
import { State } from '../enums';

interface ResetSettingsButtonProps<T> {
  defaults: T;
  onReset: (defaults: T) => void;
}

export function ResetSettingsButton<T>({
  defaults,
  onReset,
}: ResetSettingsButtonProps<T>) {
  const [isOpen, setIsOpen] = useState(false);

  const handleConfirm = () => {
    onReset(defaults);
    setIsOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="text-xs text-red-600 hover:text-red-800 font-bold px-3 py-1.5 rounded-sm bg-red-50 hover:bg-red-100 transition-colors border border-red-100"
      >
        Reset to Default
      </button>

      {isOpen && (
        <Modal
          message="Are you sure you want to reset all settings to default? This action cannot be undone."
          type={State.ERROR}
          showConfirmButton={true}
          onConfirm={handleConfirm}
          onClose={() => setIsOpen(false)}
        />
      )}
    </>
  );
}