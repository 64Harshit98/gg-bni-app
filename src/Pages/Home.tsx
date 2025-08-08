// src/Pages/Home.tsx
import { SalesBarChartReport } from "../Components/SBGraph";
import { PurchaseBarChartReport } from "../Components/PGraph";
const Home = () => {
  return (
    <div className="flex min-h-screen w-full flex-col overflow-hidden bg-slate-100 shadow-sm">
      {/* Top Bar */}
      <div className="flex flex-shrink-0 items-center justify-center border-b border-slate-200 bg-white p-4 shadow-sm">
        <h1 className="text-3xl font-bold text-slate-800">Dashboard</h1>
      </div>
      <div className="flex-grow overflow-y-auto p-6">
        <SalesBarChartReport />
        <PurchaseBarChartReport />
      </div>

    </div>
  );
};

export default Home;
