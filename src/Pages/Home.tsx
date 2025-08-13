// src/Pages/Home.tsx
import { PurchaseCard } from '../Components/PCard';
import { SalesBarChartReport } from '../Components/SBGraph';
import { SalesCard } from '../Components/SCard';
import { TopSoldItemsCard } from '../Components/TFCard';
import { TopSalespersonCard } from '../Components/TSCard';

const Home = () => {
  return (
    <div className="flex min-h-screen w-full flex-col overflow-hidden bg-slate-100 shadow-sm">
      {/* Top Bar */}
      <div className="flex flex-shrink-0 items-center justify-center border-b border-slate-200 bg-white p-4 shadow-sm">
        <h1 className="text-3xl font-bold text-slate-800">Dashboard</h1>
      </div>
      <div className="flex-grow overflow-y-auto p-4 sm:p-6">
        {/* Flex container for the cards */}
        <div className="flex w-full items-start justify-center gap-4 mb-6">
          {/* Wrapper for Sales Card */}
          <div className="flex-1 min-w-0">
            <SalesCard />
          </div>
          {/* Wrapper for Purchase Card */}
          <div className="flex-1 min-w-0">
            <PurchaseCard />
          </div>
        </div>
        <div className="mb-6">
          <SalesBarChartReport />
        </div>
        {/* Flex container for the cards */}
        <div className="flex w-full items-start justify-center gap-6 mb-6">
          {/* Wrapper for Sales Card */}
          <div className="flex-1 min-w-0">
            <TopSoldItemsCard />
          </div>
          {/* Wrapper for Purchase Card */}
          <div className="flex-1 min-w-0">
            <TopSalespersonCard />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;
