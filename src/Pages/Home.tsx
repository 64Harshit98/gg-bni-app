// src/Pages/Home.tsx
const Home = () => {
  return (
    <div className="flex min-h-screen w-full flex-col overflow-hidden bg-slate-100 shadow-sm">
      {/* Top Bar */}
      <div className="flex flex-shrink-0 items-center justify-center border-b border-slate-200 bg-white p-4 shadow-sm">
        <h1 className="text-3xl font-bold text-slate-800">Dashboard</h1>
      </div>

      {/* Main Content Area */}
      <div className="flex-grow overflow-y-auto bg-slate-100 p-6">
        <p className="mb-8 text-center text-lg italic text-slate-600">
          Welcome
        </p>
        <div className="mb-6 rounded-lg border border-slate-200 bg-white p-5 shadow-md">
          <h3 className="mb-3 border-b border-slate-100 pb-2 text-xl font-semibold text-slate-700">
            Quick Stats
          </h3>
          <p className="mb-2 text-base text-slate-600">
            Total Sales Today: ₹1,250.00
          </p>
          <p className="mb-2 text-base text-slate-600">New Orders: 15</p>
          <p className="text-base text-slate-600">Pending Tasks: 3</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-md">
          <h3 className="mb-3 border-b border-slate-100 pb-2 text-xl font-semibold text-slate-700">
            Recent Activity
          </h3>
          <ul className="list-none pl-0">
            <li className="relative mb-1 pl-4 text-base text-slate-600 before:absolute before:left-0 before:font-bold before:text-blue-500 before:content-['•']">
              New Sale: John Doe - ₹125.00
            </li>
            <li className="relative mb-1 pl-4 text-base text-slate-600 before:absolute before:left-0 before:font-bold before:text-blue-500 before:content-['•']">
              Item Added: "New Gadget"
            </li>
            <li className="relative pl-4 text-base text-slate-600 before:absolute before:left-0 before:font-bold before:text-blue-500 before:content-['•']">
              User Login: Admin
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default Home;
