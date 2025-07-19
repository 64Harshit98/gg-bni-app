// src/Pages/Journal.tsx
import  { useState } from 'react';
import './Journal.css'; // Import the CSS for the Journal page

const Journal = () => {
  // const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('Paid'); // State for active filter tab
  const [activeType, setActiveType] = useState('Debit'); // State for active type tab (Debit/Credit)

  // Dummy data for invoices - In a real app, this would come from an API
  const invoices = [
    { id: '12345', amount: 1500, time: '12:00 PM', status: 'Paid', type: 'Debit' },
    { id: '12346', amount: 2000, time: '12:00 PM', status: 'Unpaid', type: 'Debit' },
    { id: '12347', amount: 1000, time: '12:00 PM', status: 'Paid', type: 'Credit' },
    { id: '12348', amount: 3000, time: '01:00 PM', status: 'Upcoming', type: 'Debit' },
    { id: '12349', amount: 750, time: '02:00 PM', status: 'Unpaid', type: 'Credit' },
    { id: '12350', amount: 2500, time: '03:00 PM', status: 'Paid', type: 'Debit' },
  ];

  // Filter invoices based on active type and tab
  const filteredInvoices = invoices.filter(invoice =>
    invoice.type === activeType && invoice.status === activeTab
  );

  return (
    <div className="journal-page-wrapper">
      {/* Top Header */}
      <div className="journal-header">
        <h1 className="journal-title">Journal</h1>
      </div>

      {/* Debit/Credit Tabs (Top Row) */}
      <div className="journal-type-tabs">
        <button
          className={`journal-type-tab ${activeType === 'Debit' ? 'active' : ''}`}
          onClick={() => setActiveType('Debit')}
        >
          Debit
        </button>
        <button
          className={`journal-type-tab ${activeType === 'Credit' ? 'active' : ''}`}
          onClick={() => setActiveType('Credit')}
        >
          Credit
        </button>
      </div>

      {/* Paid/Unpaid/Upcoming Tabs (Second Row) */}
      <div className="journal-filter-tabs">
        <button
          className={`journal-filter-tab ${activeTab === 'Paid' ? 'active' : ''}`}
          onClick={() => setActiveTab('Paid')}
        >
          Paid
        </button>
        <button
          className={`journal-filter-tab ${activeTab === 'Unpaid' ? 'active' : ''}`}
          onClick={() => setActiveTab('Unpaid')}
        >
          Unpaid
        </button>
        <button
          className={`journal-filter-tab ${activeTab === 'Upcoming' ? 'active' : ''}`}
          onClick={() => setActiveTab('Upcoming')}
        >
          Upcoming
        </button>
      </div>

      {/* Invoice List */}
      <div className="journal-invoice-list-container">
        {filteredInvoices.length > 0 ? (
          filteredInvoices.map(invoice => (
            <div key={invoice.id} className="invoice-item">
              <div>
                <p className="invoice-number">Invoice #{invoice.id}</p>
                <p className="invoice-time">{invoice.time}</p>
              </div>
              <p className="invoice-amount">₹{invoice.amount.toFixed(2)}</p>
            </div>
          ))
        ) : (
          <p className="no-invoices-message">No invoices found for this selection.</p>
        )}
      </div>

      {/* Note: The bottom navigation bar is assumed to be a global component
          rendered outside of this Journal component, typically in your main App.tsx
          or a Layout component.
      */}
    </div>
  );
};

export default Journal;