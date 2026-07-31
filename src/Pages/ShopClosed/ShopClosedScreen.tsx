import React from 'react';

interface ShopClosedScreenProps {
  openTime: string;
  closeTime: string;
}

// "14:00" -> "2:00 PM" for friendlier display
const formatTime = (time: string): string => {
  const [hStr, mStr] = time.split(':');
  let h = Number(hStr);
  const m = mStr.padStart(2, '0');
  const suffix = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m} ${suffix}`;
};

const ShopClosedScreen: React.FC<ShopClosedScreenProps> = ({ openTime, closeTime }) => {
  // IMPORTANT: This component renders OUTSIDE the RouterProvider tree
  // (ShopHoursGuard sits above AppRouter in main.tsx), so useNavigate()
  // is not available here. Use a plain location change instead.
  const handleBackToLogin = () => {
    window.location.href = '/';
  };

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center bg-card px-6 text-center">
      <div className="text-5xl mb-4">🔒</div>
      <h1 className="text-2xl font-bold text-foreground mb-2">Store Is Currently Closed</h1>
      <p className="text-muted-foreground max-w-sm mb-1">
        This account can only log in during the store's working hours.
      </p>
      <p className="text-foreground font-medium mb-6">
        Open: {formatTime(openTime)} &nbsp;–&nbsp; Close: {formatTime(closeTime)}
      </p>
      <button
        onClick={handleBackToLogin}
        className="px-6 py-3 rounded-sm bg-black text-white font-semibold"
      >
        Back to Login
      </button>
    </div>
  );
};

export default ShopClosedScreen;