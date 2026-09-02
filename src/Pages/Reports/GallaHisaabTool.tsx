import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '../../lib/Firebase';
import { useAuth } from '../../context/auth-context';
import { IconClose } from '../../constants/Icons';
import { useNavigate } from 'react-router';
interface Props {
  isDataVisible?: boolean;
  paymentData?: { name: string; amount: number; quantity: number }[];
  cashAmount?: number;
}

function GallaHisaabTool({ isDataVisible = true, paymentData = [], cashAmount = 0 }: Props) {
  const [datePreset, setDatePreset] = useState('today');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [fetchedCash, setFetchedCash] = useState(0);
  const [cashBreakdown, setCashBreakdown] = useState<{ received: number; returned: number }[]>([]);

  const [openingBalance, setOpeningBalance] = useState<number>(0);
  const [usePrevClosing, setUsePrevClosing] = useState(false);

  const [history, setHistory] = useState<any[]>([]);

  const cashFromData = paymentData.find(p => p.name === 'Cash')?.amount || 0;
  const displayCash = fetchedCash || cashAmount || cashFromData;

  const fetchCashFromDB = async () => {
    if (!currentUser?.companyId) return;

    try {
      const salesRef = collection(db, 'companies', currentUser.companyId, 'sales');
      let q = query(salesRef, orderBy('createdAt', 'desc'));

      if (startDate && endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);

        q = query(
          salesRef,
          where('createdAt', '>=', start),
          where('createdAt', '<=', end),
          orderBy('createdAt', 'desc')
        );
      }

      const snap = await getDocs(q);

      let totalCash = 0;
      const breakdown: { received: number; returned: number }[] = [];

      const dailyMap: Record<string, { received: number; returned: number; net: number }> = {};

      snap.docs.forEach(doc => {
        const d = doc.data();

        if (d.paymentMethods && typeof d.paymentMethods === 'object') {
          const date = new Date(d.createdAt?.seconds ? d.createdAt.seconds * 1000 : d.createdAt);
          const dateKey = date.toISOString().split('T')[0];

          const methods = Object.entries(d.paymentMethods)
            .map(([key, val]) => ({ key: key.toLowerCase(), amt: Number(val) || 0 }))
            .filter(m => m.amt > 0);

          if (methods.length > 0) {
            const billAmount = Number(d.totalAmount || d.total || d.amount || d.grandTotal || 0);
            const totalTendered = methods.reduce((sum, m) => sum + m.amt, 0);

            let change = totalTendered > billAmount ? totalTendered - billAmount : 0;

            let cashReceived = 0;
            let cashReturned = 0;

            if (!dailyMap[dateKey]) {
              dailyMap[dateKey] = { received: 0, returned: 0, net: 0 };
            }

            methods.forEach(m => {
              let finalAmt = m.amt;

              if (m.key === 'cash') {
                cashReceived += m.amt;
              }

              if (change > 0 && m.key === 'cash') {
                const deduct = Math.min(finalAmt, change);
                finalAmt -= deduct;
                change -= deduct;
                cashReturned += deduct;
              }

              // Deduct remaining change from other methods if needed
              if (change > 0) {
                const deduct = Math.min(finalAmt, change);
                finalAmt -= deduct;
                change -= deduct;
              }

              // Only count cash
              if (m.key === 'cash' && finalAmt > 0) {
                totalCash += finalAmt;
              }
            });

            if (cashReceived > 0) {
              breakdown.push({ received: cashReceived, returned: cashReturned });
            }

            dailyMap[dateKey].received += cashReceived;
            dailyMap[dateKey].returned += cashReturned;
            dailyMap[dateKey].net += (cashReceived - cashReturned);
          }
        }
      });

      const historyList = Object.entries(dailyMap)
        .map(([date, val]) => ({ date, ...val }))
        .sort((a, b) => b.date.localeCompare(a.date));

      setHistory(historyList);

      setCashBreakdown(breakdown);
      setFetchedCash(totalCash);
    } catch (e) {
      console.error('Error fetching cash:', e);
    }
  };

  const loadPreviousClosing = () => {
    const prev = localStorage.getItem('galla_prev_closing');
    if (prev) setOpeningBalance(Number(prev));
  };

  useEffect(() => {
    fetchCashFromDB();
  }, [currentUser]);

  useEffect(() => {
    if (usePrevClosing) {
      loadPreviousClosing();
    }
  }, [usePrevClosing]);

  const closingBalance = openingBalance + displayCash;

  useEffect(() => {
    if (closingBalance > 0) {
      localStorage.setItem('galla_prev_closing', String(closingBalance));
    }
  }, [closingBalance]);

  const handleApply = () => {
    fetchCashFromDB();
  };

  return (
    <div className="min-h-screen bg-gray-100 p-3 md:p-6">
      <div className="relative flex items-center justify-center mb-4">

        {/* Cross Button - Left Side */}
        <button
          onClick={() => navigate(-1)}
          className="absolute left-0 text-gray-500 hover:text-gray-900 transition-colors"
        >
          <IconClose />
        </button>

        {/* Centered Heading */}
        <h1 className="text-xl font-bold text-center md:text-2xl">
          Galla Hisaab
        </h1>

      </div>

      {/* FILTER CARD */}
      <div className="bg-white p-3 rounded-lg shadow-md md:p-5 md:rounded-xl">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 md:grid-cols-1 md:gap-3">

          {/* Preset */}
          <select
            value={datePreset}
            onChange={(e) => setDatePreset(e.target.value)}
            className="w-full p-2 bg-gray-50 border rounded-md"
          >
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="last7">Last 7 Days</option>
            <option value="last30">Last 30 Days</option>
            <option value="custom">Custom</option>
          </select>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3 sm:col-span-2 md:col-span-1">
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setDatePreset('custom');
              }}
              className="w-full p-2 bg-gray-50 border rounded-md"
            />
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setDatePreset('custom');
              }}
              className="w-full p-2 bg-gray-50 border rounded-md"
            />
          </div>
        </div>

        {/* Apply Button */}
        <div className="mt-3 md:flex md:justify-center">
          <button
            onClick={handleApply}
            className="w-full px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 md:w-auto md:px-10"
          >
            Apply
          </button>
        </div>
      </div>

      {/* RESULT CARD */}
      <div className="mt-4 bg-white p-4 rounded-lg shadow-md">
        {isDataVisible ? (
          <>
            {/* CARD 1: Opening + Net Cash + Breakdown */}
            <div className="bg-white p-4 rounded-lg shadow-md mb-3">
              {/* NET CASH */}
              <div className="border-b pb-3 mb-3">
                <h2 className="text-sm text-gray-500">Net Cash (After Change)</h2>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  ₹{displayCash.toLocaleString('en-IN')}
                </p>
              </div>

              {/* OPENING */}
              <div className="mb-3">
                <label className="text-sm text-gray-600">Opening Balance</label>
                <input
                  type="number"
                  value={openingBalance}
                  onChange={(e) => setOpeningBalance(Number(e.target.value))}
                  className="w-full mt-1 p-2 border rounded-md"
                  disabled={usePrevClosing}
                />

                <div className="flex items-center mt-2">
                  <input
                    type="checkbox"
                    checked={usePrevClosing}
                    onChange={(e) => setUsePrevClosing(e.target.checked)}
                    className="mr-2"
                  />
                  <span className="text-sm text-gray-600">Use Previous Closing</span>
                </div>
              </div>

              {/* CLOSING */}
              <div className="mb-3 border-t pt-3">
                <h3 className="text-sm text-gray-500">Expected Closing</h3>
                <p className="text-xl font-semibold text-green-600">
                  ₹{closingBalance.toLocaleString('en-IN')}
                </p>
              </div>

              {/* BREAKDOWN */}
              <details className="mt-3">
                <summary className="cursor-pointer text-black font-medium">
                  View Cash Breakdown
                </summary>

                <div className="mt-2 space-y-2 max-h-40 overflow-y-auto">
                  {cashBreakdown.map((item, index) => (
                    <div key={index} className="flex justify-between text-sm bg-gray-50 p-2 rounded">
                      <span>Received: ₹{item.received}</span>
                      <span>Returned: ₹{item.returned}</span>
                    </div>
                  ))}
                </div>
              </details>
            </div>

            {/* CARD 2: Daily History */}
            <div className="bg-white p-4 rounded-lg shadow-md">
              <h3 className="text-sm text-gray-500 mb-2">Previous Daily History</h3>

              <div className="space-y-2 max-h-48 overflow-y-auto">
                {history.map((day, idx) => (
                  <div key={idx} className="bg-gray-50 p-2 rounded text-sm">
                    <div className="font-medium">{day.date}</div>
                    <div className="flex justify-between">
                      <span>Received: ₹{day.received}</span>
                      <span>Returned: ₹{day.returned}</span>
                    </div>
                    <div className="flex justify-between text-green-600 font-semibold">
                      <span>Net:</span>
                      <span>₹{day.net}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <p className="text-gray-400 mt-2">Hidden</p>
        )}
      </div>
    </div>
  );
}

export { GallaHisaabTool };
export default GallaHisaabTool;