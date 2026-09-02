import React from 'react';

interface Props {
  closeTime: string;
  onConfirmClose: () => void;
  onSnooze: () => void;
}

const formatTime = (time: string): string => {
  const [hStr, mStr] = time.split(':');
  let h = Number(hStr);
  const m = mStr.padStart(2, '0');
  const suffix = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m} ${suffix}`;
};

const ShopClosingReminderModal: React.FC<Props> = ({ closeTime, onConfirmClose, onSnooze }) => (
  <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 px-4">
    <div className="bg-white rounded-sm shadow-xl max-w-sm w-full p-6 text-center">
      <div className="text-4xl mb-3">⏰</div>
      <h2 className="text-xl font-bold text-gray-800 mb-2">Closing Time Near!</h2>
      <p className="text-gray-600 text-sm mb-1">
        Shop closing time is <span className="font-semibold text-gray-800">{formatTime(closeTime)}</span>.
      </p>
      <p className="text-gray-500 text-sm mb-6">
        Close now or snooze? If no action is taken, the shop will automatically close after 1 hour.
      </p>
      <div className="flex gap-3">
        <button
          onClick={onSnooze}
          className="flex-1 py-2.5 rounded-sm border border-gray-300 text-gray-700 font-medium text-sm hover:bg-gray-50 transition"
        >
          🔕 Snooze (15 min)
        </button>
        <button
          onClick={onConfirmClose}
          className="flex-1 py-2.5 rounded-sm bg-red-500 text-white font-semibold text-sm hover:bg-red-600 transition"
        >
          🔒 Yes, Close Now
        </button>
      </div>
    </div>
  </div>
);

export default ShopClosingReminderModal;