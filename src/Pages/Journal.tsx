// src/Pages/Journal.tsx
import { useState } from 'react';

const Journal = () => {
  const [activeTab, setActiveTab] = useState('Paid');
  const [activeType, setActiveType] = useState('Debit');

  const invoices = [
    {
      id: '12345',
      amount: 1500,
      time: '12:00 PM',
      status: 'Paid',
      type: 'Debit',
    },
    {
      id: '12346',
      amount: 2000,
      time: '12:00 PM',
      status: 'Unpaid',
      type: 'Debit',
    },
    {
      id: '12347',
      amount: 1000,
      time: '12:00 PM',
      status: 'Paid',
      type: 'Credit',
    },
    {
      id: '12348',
      amount: 3000,
      time: '01:00 PM',
      status: 'Upcoming',
      type: 'Debit',
    },
    {
      id: '12349',
      amount: 750,
      time: '02:00 PM',
      status: 'Unpaid',
      type: 'Credit',
    },
    {
      id: '12350',
      amount: 2500,
      time: '03:00 PM',
      status: 'Paid',
      type: 'Debit',
    },
  ];

  const filteredInvoices = invoices.filter(
    (invoice) => invoice.type === activeType && invoice.status === activeTab,
  );

  return (
    <div className="flex min-h-screen w-full flex-col overflow-hidden bg-white shadow-md">
      {/* Top Header */}
      <div className="flex flex-shrink-0 items-center justify-start border-b border-slate-200 bg-white p-4 px-6 shadow-sm">
        <h1 className="text-3xl font-bold text-slate-800">Journal</h1>
      </div>

      {/* Debit/Credit Tabs */}
      <div className="flex justify-around border-b border-slate-200 bg-white px-6 shadow-sm">
        <button
          className={`flex-1 cursor-pointer border-b-2 py-3 text-center text-base font-medium transition hover:text-slate-700 ${
            activeType === 'Debit'
              ? 'border-blue-600 font-semibold text-blue-600'
              : 'border-transparent text-slate-500'
          }`}
          onClick={() => setActiveType('Debit')}
        >
          Debit (-)
        </button>
        <button
          className={`flex-1 cursor-pointer border-b-2 py-3 text-center text-base font-medium transition hover:text-slate-700 ${
            activeType === 'Credit'
              ? 'border-blue-600 font-semibold text-blue-600'
              : 'border-transparent text-slate-500'
          }`}
          onClick={() => setActiveType('Credit')}
        >
          Credit (+)
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex justify-around border-b border-slate-200 bg-white p-3 px-6 shadow-md">
        <button
          className={`cursor-pointer rounded-lg border px-5 py-2 text-sm font-medium transition ${
            activeTab === 'Paid'
              ? 'border-blue-600 bg-blue-600 text-white shadow-md'
              : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-blue-300 hover:bg-blue-50'
          }`}
          onClick={() => setActiveTab('Paid')}
        >
          Paid
        </button>
        <button
          className={`cursor-pointer rounded-lg border px-5 py-2 text-sm font-medium transition ${
            activeTab === 'Unpaid'
              ? 'border-blue-600 bg-blue-600 text-white shadow-md'
              : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-blue-300 hover:bg-blue-50'
          }`}
          onClick={() => setActiveTab('Unpaid')}
        >
          Unpaid
        </button>
      </div>

      {/* Invoice List */}
      <div className="flex-grow overflow-y-auto bg-slate-100 p-6">
        {filteredInvoices.length > 0 ? (
          filteredInvoices.map((invoice) => (
            <div
              key={invoice.id}
              className="mb-4 flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4 px-5 shadow-sm transition hover:-translate-y-0.5"
            >
              <div>
                <p className="mb-1 text-lg font-semibold text-slate-800">
                  Invoice #{invoice.id}
                </p>
                <p className="text-sm text-slate-500">{invoice.time}</p>
              </div>
              <p className="text-2xl font-bold text-slate-800">
                ₹{invoice.amount.toFixed(2)}
              </p>
            </div>
          ))
        ) : (
          <p className="p-8 text-center text-base text-slate-500">
            No invoices found for this selection.
          </p>
        )}
      </div>
    </div>
  );
};

export default Journal;
