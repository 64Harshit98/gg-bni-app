import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Calculator, ChevronDown, X } from 'lucide-react';
import { useAuth } from '../../context/auth-context';
import { Button } from '../../Components/ui/button';
import { Input } from '../../Components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../Components/ui/select';
import {
  fetchGallaHisaabSummary,
  type CashBreakdownEntry,
  type DailyCashHistoryEntry,
} from '../../services/reports/gallaHisaab.service';

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
  const [cashBreakdown, setCashBreakdown] = useState<CashBreakdownEntry[]>([]);
  const [history, setHistory] = useState<DailyCashHistoryEntry[]>([]);

  const [openingBalance, setOpeningBalance] = useState<number>(0);
  const [usePrevClosing, setUsePrevClosing] = useState(false);

  const cashFromData = paymentData.find((p) => p.name === 'Cash')?.amount || 0;
  const displayCash = fetchedCash || cashAmount || cashFromData;

  const fetchCashFromDB = async () => {
    if (!currentUser?.companyId) return;

    try {
      const { totalCash, breakdown, history: dailyHistory } = await fetchGallaHisaabSummary(
        currentUser.companyId,
        { startDate, endDate },
      );
      setFetchedCash(totalCash);
      setCashBreakdown(breakdown);
      setHistory(dailyHistory);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    <div className="aurora min-h-screen bg-background pb-16">
      <header className="glass sticky top-0 z-10 flex items-center gap-3 border-b border-border px-4 py-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Close"
          className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-accent hover:text-foreground"
        >
          <X className="size-4" />
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-bold tracking-tight text-foreground">
            Galla <span className="text-gradient">Hisaab</span>
          </h1>
          <p className="text-xs text-muted-foreground">Daily cash reconciliation</p>
        </div>
        <span className="hidden size-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground shadow-xs sm:flex">
          <Calculator className="size-4" />
        </span>
      </header>

      <div className="mx-auto w-full max-w-2xl px-4 py-6 md:px-8 animate-in fade-in-0 slide-in-from-bottom-2 duration-500">
        {/* FILTER CARD */}
        <div className="rounded-2xl border border-border bg-card p-4 shadow-xs md:p-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 md:grid-cols-1">
            <Select value={datePreset} onValueChange={setDatePreset}>
              <SelectTrigger className="w-full bg-muted">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="yesterday">Yesterday</SelectItem>
                <SelectItem value="last7">Last 7 Days</SelectItem>
                <SelectItem value="last30">Last 30 Days</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>

            <div className="grid grid-cols-2 gap-3 sm:col-span-2 md:col-span-1">
              <Input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setDatePreset('custom');
                }}
              />
              <Input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setDatePreset('custom');
                }}
              />
            </div>
          </div>

          <div className="mt-3 md:flex md:justify-center">
            <Button onClick={handleApply} className="w-full md:w-auto md:px-10">
              Apply
            </Button>
          </div>
        </div>

        {/* RESULT CARD */}
        <div className="mt-4 rounded-2xl border border-border bg-card p-4 shadow-xs">
          {isDataVisible ? (
            <>
              {/* CARD 1: Opening + Net Cash + Breakdown */}
              <div className="mb-3 rounded-2xl border border-border bg-card p-4 shadow-xs">
                {/* NET CASH */}
                <div className="mb-3 border-b border-border pb-3">
                  <h2 className="text-sm text-muted-foreground">Net Cash (After Change)</h2>
                  <p className="mt-1 text-2xl font-bold text-foreground">
                    ₹{displayCash.toLocaleString('en-IN')}
                  </p>
                </div>

                {/* OPENING */}
                <div className="mb-3">
                  <label className="text-sm text-muted-foreground">Opening Balance</label>
                  <Input
                    type="number"
                    value={openingBalance}
                    onChange={(e) => setOpeningBalance(Number(e.target.value))}
                    className="mt-1"
                    disabled={usePrevClosing}
                  />

                  <label className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={usePrevClosing}
                      onChange={(e) => setUsePrevClosing(e.target.checked)}
                      className="size-4 rounded border-border accent-primary"
                    />
                    Use Previous Closing
                  </label>
                </div>

                {/* CLOSING */}
                <div className="mb-1 border-t border-border pt-3">
                  <h3 className="text-sm text-muted-foreground">Expected Closing</h3>
                  <p className="text-xl font-semibold text-success">
                    ₹{closingBalance.toLocaleString('en-IN')}
                  </p>
                </div>

                {/* BREAKDOWN */}
                <details className="mt-3 group">
                  <summary className="flex cursor-pointer list-none items-center gap-1 font-medium text-foreground">
                    View Cash Breakdown
                    <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
                  </summary>

                  <div className="mt-2 max-h-40 space-y-2 overflow-y-auto">
                    {cashBreakdown.map((item, index) => (
                      <div key={index} className="flex justify-between rounded-lg bg-muted p-2 text-sm">
                        <span>Received: ₹{item.received}</span>
                        <span>Returned: ₹{item.returned}</span>
                      </div>
                    ))}
                  </div>
                </details>
              </div>

              {/* CARD 2: Daily History */}
              <div className="rounded-2xl border border-border bg-card p-4 shadow-xs">
                <h3 className="mb-2 text-sm text-muted-foreground">Previous Daily History</h3>

                <div className="max-h-48 space-y-2 overflow-y-auto">
                  {history.map((day, idx) => (
                    <div key={idx} className="rounded-lg bg-muted p-2 text-sm">
                      <div className="font-medium text-foreground">{day.date}</div>
                      <div className="flex justify-between text-muted-foreground">
                        <span>Received: ₹{day.received}</span>
                        <span>Returned: ₹{day.returned}</span>
                      </div>
                      <div className="flex justify-between font-semibold text-success">
                        <span>Net:</span>
                        <span>₹{day.net}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <p className="mt-2 text-muted-foreground">Hidden</p>
          )}
        </div>
      </div>
    </div>
  );
}

export { GallaHisaabTool };
export default GallaHisaabTool;
