import React from 'react';

interface ShopClosedScreenProps {
  openTime: string;
  closeTime: string;
}

// "14:00" -> "2:00 pm" for friendlier display
const formatTime = (time: string): string => {
  const [hStr, mStr = '00'] = time.split(':');
  const h = Number(hStr);
  return `${h % 12 || 12}:${mStr.padStart(2, '0')} ${h >= 12 ? 'pm' : 'am'}`;
};

const ShopClosedScreen: React.FC<ShopClosedScreenProps> = ({ openTime, closeTime }) => {
  // IMPORTANT: This component renders OUTSIDE the RouterProvider tree
  // (ShopHoursGuard sits above AppRouter in main.tsx), so useNavigate()
  // is not available here. Use a plain location change instead.
  const handleBackToLogin = () => {
    window.location.href = '/';
  };

  return (
    <div className="flex min-h-screen w-screen flex-col items-center justify-center bg-[#eef2ff] px-6 text-center">
      <div className="w-full max-w-sm bg-white border border-[#dfe6fb] rounded-sm shadow-[0_1px_2px_rgba(21,48,140,0.05),0_2px_6px_rgba(21,48,140,0.06)] p-6 grid gap-4">
        <span className="justify-self-center w-14 h-14 rounded-sm bg-amber-50 text-amber-700 grid place-items-center">
          <svg
            className="w-7 h-7"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="5" y="11" width="14" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
        </span>

        <div>
          <h1 className="text-xl font-semibold text-gray-900">Store is currently closed</h1>
          <p className="text-sm text-gray-600 mt-1 leading-relaxed">
            This account can only log in during the store's working hours.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 text-left">
          <div className="rounded-sm bg-[#f5f7ff] border border-[#dfe6fb] px-3.5 py-2.5">
            <span className="block text-xs font-medium text-gray-500">Opens at</span>
            <b className="block text-sm font-semibold tabular-nums text-gray-900">{formatTime(openTime)}</b>
          </div>
          <div className="rounded-sm bg-[#f5f7ff] border border-[#dfe6fb] px-3.5 py-2.5">
            <span className="block text-xs font-medium text-gray-500">Closes at</span>
            <b className="block text-sm font-semibold tabular-nums text-gray-900">{formatTime(closeTime)}</b>
          </div>
        </div>

        <button
          onClick={handleBackToLogin}
          className="w-full h-11 rounded-sm bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white text-sm font-medium transition"
        >
          Back to login
        </button>
      </div>
    </div>
  );
};

export default ShopClosedScreen;