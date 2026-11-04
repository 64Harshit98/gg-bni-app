import React from 'react';

// Image-free placeholder for the public storefront while its code is loading.
// Deliberately cheap (no logo, no background image, no animation library) —
// it's what a buyer on a slow mobile connection stares at, so it must paint
// instantly. Same layout as StoreLoading in StoreUI, which takes over once the
// page's code has arrived, so the handover doesn't jump.
const StorefrontSkeleton: React.FC = () => (
  <div className="min-h-[100dvh] bg-sf-canvas" aria-busy="true" aria-label="Loading the store">
    <div className="h-14 border-b border-sf-line bg-white md:h-[72px]" />
    <div className="mx-auto grid max-w-[1200px] gap-6 px-4 pt-5 md:px-10">
      <div className="aspect-[2/1] animate-pulse rounded-sm bg-white motion-reduce:animate-none md:aspect-[3/1]" />
      <div className="grid grid-cols-4 gap-3 md:grid-cols-10 md:gap-4">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="aspect-square animate-pulse rounded-sm bg-white motion-reduce:animate-none" />
        ))}
      </div>
    </div>
  </div>
);

export default StorefrontSkeleton;
