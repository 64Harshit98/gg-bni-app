import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { collection, getDocs, doc, updateDoc, deleteDoc } from "firebase/firestore";
import { db } from "../../lib/Firebase";
import { IconClose } from "../../constants/Icons";
import { CustomCard } from "../../Components/CustomCard";
import { CardVariant } from "../../enums";
import { useAuth } from "../../context/auth-context";
import { Search } from "lucide-react"; // Imported Search Icon

type LeadType = {
  id: string;
  email?: string;
  fullName?: string;
  phoneNumber?: string;
  currentStep?: string; // "Step 1", "Step 2", "Completed", etc.
  salesStatus?: string; // "Pending", "Interested", "Not interested", "Issue"
  isWorking?: boolean;  // Mark true in your DB if the company is live/working
  lastUpdated?: any;
};

const SUPER_ADMIN_UIDS = [
  "6vwZ1HRqX7VSnh5KP4JW0TKeuZm2",
  "1AKioGfop8PmHhry6uXOz8Rw6qT2"
];

type FilterType = "all" | "Registration" | "Trial Plan" | "Abandoned";

const toDateStr = (date: Date) => date.toISOString().split("T")[0];

function LeadsPage() {
  const navigate = useNavigate();
  const [leads, setLeads] = useState<LeadType[]>([]);
  const [activeFilter, setActiveFilter] = useState<FilterType>("all");
  const { currentUser } = useAuth();
  const [datePreset, setDatePreset] = useState("today");

  // Search & Sorter State
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");

  const [customStartDate, setCustomStartDate] = useState(() => toDateStr(new Date()));
  const [customEndDate, setCustomEndDate] = useState(() => toDateStr(new Date()));

  const [appliedFilters, setAppliedFilters] = useState<{ start: number; end: number }>(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    return { start: start.getTime(), end: end.getTime() };
  });

  const handleDatePresetChange = (preset: string) => {
    setDatePreset(preset);
    if (preset === "custom") return;

    const start = new Date();
    const end = new Date();

    switch (preset) {
      case "yesterday":
        start.setDate(start.getDate() - 1);
        end.setDate(end.getDate() - 1);
        break;
      case "last7":
        start.setDate(start.getDate() - 6);
        break;
      case "last30":
        start.setDate(start.getDate() - 29);
        break;
    }

    setCustomStartDate(toDateStr(start));
    setCustomEndDate(toDateStr(end));
  };

  const handleApplyFilters = () => {
    const start = customStartDate ? new Date(customStartDate) : new Date(0);
    start.setHours(0, 0, 0, 0);
    const end = customEndDate ? new Date(customEndDate) : new Date();
    end.setHours(23, 59, 59, 999);
    setAppliedFilters({ start: start.getTime(), end: end.getTime() });
    setActiveFilter("all");
  };

  useEffect(() => {
    if (!currentUser || !SUPER_ADMIN_UIDS.includes(currentUser.uid)) {
      return;
    }

    const fetchLeads = async () => {
      const snap = await getDocs(collection(db, "leads"));
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as LeadType[];
      setLeads(list);
    };

    fetchLeads();
  }, [currentUser]);

  // =========================================================================
  // DYNAMIC CATEGORY LOGIC
  // Based strictly on step progress, age of the lead, and working status
  // =========================================================================
  const getLeadCategory = (lead: LeadType): FilterType | "Hide" => {
    // 1. If company is working, do not show in any filter
    if (lead.isWorking || lead.salesStatus === "Converted") {
      return "Hide";
    }

    let leadDate = new Date();
    if (lead.lastUpdated) {
      leadDate = typeof lead.lastUpdated.toDate === "function"
        ? lead.lastUpdated.toDate()
        : new Date(lead.lastUpdated);
    }

    // Calculate how many days old this lead is
    const daysOld = (new Date().getTime() - leadDate.getTime()) / (1000 * 60 * 60 * 24);

    // 2. If older than 10 days, it automatically becomes Abandoned
    if (daysOld > 10) {
      return "Abandoned";
    }

    // 3. If step is Completed, they are in Trial Plan
    const step = lead.currentStep?.toLowerCase() || "";
    if (step === "completed") {
      return "Trial Plan";
    }

    // 4. Default: If Step 1 or 2 (or anything else active), they are in Registration
    return "Registration";
  };

  const handleStatusChange = async (id: string, newSalesStatus: string) => {
    try {
      await updateDoc(doc(db, "leads", id), { salesStatus: newSalesStatus });
      setLeads(prev => prev.map(l => l.id === id ? { ...l, salesStatus: newSalesStatus } : l));
    } catch (error) {
      console.error("Error updating status:", error);
      alert("Failed to update status.");
    }
  };

  const handleDeleteLead = async (id: string) => {
    const confirmDelete = window.confirm("Are you sure you want to permanently delete this lead?");
    if (!confirmDelete) return;

    try {
      await deleteDoc(doc(db, "leads", id));
      setLeads(prev => prev.filter(l => l.id !== id));
    } catch (error) {
      console.error("Error deleting lead:", error);
      alert("Failed to delete lead.");
    }
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return "--";
    const date = typeof timestamp.toDate === "function" ? timestamp.toDate() : new Date(timestamp);
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = String(date.getFullYear()).slice(-2);
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${day}/${month}/${year} ${hours}:${minutes}`;
  };

  // Base list of leads filtered by Date AND completely hiding "Working" companies
  const dateFilteredLeads = useMemo(() => {
    return leads.filter(lead => {
      // Throw out companies that shouldn't show in any filter
      if (getLeadCategory(lead) === "Hide") return false;

      if (!lead.lastUpdated) return false;
      const date = typeof lead.lastUpdated.toDate === "function"
        ? lead.lastUpdated.toDate()
        : new Date(lead.lastUpdated);
      return (
        date.getTime() >= appliedFilters.start &&
        date.getTime() <= appliedFilters.end
      );
    });
  }, [leads, appliedFilters]);

  // Generate Stats dynamically
  const stats = useMemo(() => ({
    total: dateFilteredLeads.length,
    registration: dateFilteredLeads.filter(l => getLeadCategory(l) === "Registration").length,
    trial: dateFilteredLeads.filter(l => getLeadCategory(l) === "Trial Plan").length,
    abandoned: dateFilteredLeads.filter(l => getLeadCategory(l) === "Abandoned").length,
  }), [dateFilteredLeads]);

  // Apply Big Box Filter -> Apply Search Query -> Apply Sorter
  const filteredLeads = useMemo(() => {
    // 1. Filter by Big Box
    let list = activeFilter === "all"
      ? dateFilteredLeads
      : dateFilteredLeads.filter(l => getLeadCategory(l) === activeFilter);

    // 2. Filter by Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(l =>
        l.fullName?.toLowerCase().includes(q) ||
        l.email?.toLowerCase().includes(q) ||
        l.phoneNumber?.toLowerCase().includes(q)
      );
    }

    // 3. Sort Results
    return list.sort((a, b) => {
      const dateA = a.lastUpdated?.toDate ? a.lastUpdated.toDate().getTime() : new Date(a.lastUpdated || 0).getTime();
      const dateB = b.lastUpdated?.toDate ? b.lastUpdated.toDate().getTime() : new Date(b.lastUpdated || 0).getTime();

      return sortOrder === "newest" ? dateB - dateA : dateA - dateB;
    });
  }, [dateFilteredLeads, activeFilter, sortOrder, searchQuery]);

  const toggleFilter = (f: FilterType) =>
    setActiveFilter(prev => (prev === f ? "all" : f));

  return (
    <div className="min-h-screen bg-muted p-4 md:p-8 pb-16">

      {/* HEADER */}
      <div className="flex items-center justify-between pb-3 border-b mb-2">
        <h1 className="flex-1 text-xl text-center font-bold text-foreground">
          App Registration Leads
        </h1>
        <button onClick={() => navigate(-1)} className="p-2">
          <IconClose width={20} height={20} />
        </button>
      </div>

      {/* DATE FILTER */}
      <div className="bg-card p-4 rounded-sm shadow-md mb-2">
        <div className="grid grid-cols-1 gap-3">
          <select
            value={datePreset}
            onChange={(e) => handleDatePresetChange(e.target.value)}
            className="w-full p-2 text-sm bg-muted border rounded-sm outline-none focus:ring-1 focus:ring-gray-400"
          >
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="last7">Last 7 Days</option>
            <option value="last30">Last 30 Days</option>
            <option value="custom">Custom</option>
          </select>

          <div className="grid grid-cols-2 gap-4">
            <input
              type="date"
              value={customStartDate}
              onChange={(e) => { setCustomStartDate(e.target.value); setDatePreset("custom"); }}
              className="w-full p-2 text-sm bg-muted border rounded-sm outline-none focus:ring-1 focus:ring-gray-400"
            />
            <input
              type="date"
              value={customEndDate}
              onChange={(e) => { setCustomEndDate(e.target.value); setDatePreset("custom"); }}
              className="w-full p-2 text-sm bg-muted border rounded-sm outline-none focus:ring-1 focus:ring-gray-400"
            />
          </div>
        </div>

        <div className="flex justify-center mt-2">
          <button
            onClick={handleApplyFilters}
            className="w-full md:w-fit mt-2 px-10 py-2 bg-blue-600 text-white text-sm font-semibold rounded-sm hover:bg-blue-700"
          >
            Apply
          </button>
        </div>
      </div>

      {/* FILTER CARDS */}
      <div className="grid grid-cols-2 gap-2 mb-4 md:grid-cols-4 md:gap-4">
        <div
          onClick={() => toggleFilter("all" as FilterType)}
          className={`cursor-pointer rounded-sm transition-all border-2 ${activeFilter === "all"
            ? "border-gray-600 bg-muted shadow-md scale-105"
            : "border-transparent"
            }`}
        >
          <CustomCard variant={CardVariant.Summary} title="Total Leads" value={stats.total.toString()} />
        </div>

        <div
          onClick={() => toggleFilter("Registration")}
          className={`cursor-pointer rounded-sm transition-all border-2 ${activeFilter === "Registration"
            ? "border-green-600 bg-green-50 shadow-md scale-105"
            : "border-transparent"
            }`}
        >
          <CustomCard variant={CardVariant.Summary} title="Registration" value={stats.registration.toString()} />
        </div>

        <div
          onClick={() => toggleFilter("Trial Plan")}
          className={`cursor-pointer rounded-sm transition-all border-2 ${activeFilter === "Trial Plan"
            ? "border-blue-600 bg-blue-50 shadow-md scale-105"
            : "border-transparent"
            }`}
        >
          <CustomCard variant={CardVariant.Summary} title="Trial Plan" value={stats.trial.toString()} />
        </div>

        <div
          onClick={() => toggleFilter("Abandoned")}
          className={`cursor-pointer rounded-sm transition-all border-2 ${activeFilter === "Abandoned"
            ? "border-red-600 bg-red-50 shadow-md scale-105"
            : "border-transparent"
            }`}
        >
          <CustomCard variant={CardVariant.Summary} title="Abandoned" value={stats.abandoned.toString()} />
        </div>
      </div>

      {/* SEARCH, SORTER & TABLE */}
      <div className="bg-card p-4 rounded-sm shadow-md mb-2">
        <div className="flex flex-col md:flex-row justify-between items-center gap-3 mb-4">

          {/* Main Search Bar */}
          <div className="relative w-full md:max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, email, or phone..."
              className="w-full pl-9 pr-4 py-2 text-sm bg-card border border-border rounded-sm shadow-sm focus:ring-1 focus:ring-gray-400 outline-none"
            />
          </div>

          {/* Sorter Dropdown */}
          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as "newest" | "oldest")}
            className="w-full md:w-auto p-2 text-sm bg-muted border border-border rounded-sm outline-none cursor-pointer focus:ring-1 focus:ring-gray-400"
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-sm">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <th className="p-3 text-left">Name</th>
                <th className="p-3 text-left">Phone</th>
                <th className="p-3 text-left">Current Step</th>
                <th className="p-3 text-left">Last Updated</th>
                <th className="p-3 text-left">Sales Status</th>
                <th className="p-3 text-center">Action</th>
              </tr>
            </thead>

            <tbody>
              {filteredLeads.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-muted-foreground">No leads found.</td>
                </tr>
              ) : (
                filteredLeads.map((lead) => (
                  <tr key={lead.id} className="border-t hover:bg-muted transition-colors">
                    <td className="p-3">
                      <p className="font-bold text-foreground">{lead.fullName || "-"}</p>
                      <p className="text-xs text-muted-foreground">{lead.email || "-"}</p>
                    </td>
                    <td className="p-3 font-medium">{lead.phoneNumber || "-"}</td>
                    <td className="p-3">
                      <span className="bg-muted px-2 py-1 rounded-sm text-xs font-bold text-muted-foreground">
                        {lead.currentStep || "-"}
                      </span>
                    </td>
                    <td className="p-3 text-muted-foreground">{formatDate(lead.lastUpdated)}</td>

                    {/* Call Dispositions Dropdown */}
                    <td className="p-3">
                      <select
                        value={lead.salesStatus || "Pending"}
                        onChange={(e) => handleStatusChange(lead.id, e.target.value)}
                        className={`text-xs font-bold p-1.5 rounded-sm border cursor-pointer outline-none ${lead.salesStatus === "Interested" ? "bg-green-50 text-green-700 border-green-200" :
                            lead.salesStatus === "Not interested" ? "bg-red-50 text-red-700 border-red-200" :
                              lead.salesStatus === "Issue" ? "bg-orange-50 text-orange-700 border-orange-200" :
                                "bg-blue-50 text-blue-700 border-blue-200"
                          }`}
                      >
                        <option value="Pending">Pending</option>
                        <option value="Interested">Interested</option>
                        <option value="Not interested">Not interested</option>
                        <option value="Issue">Issue</option>
                      </select>
                    </td>

                    {/* Delete Lead */}
                    <td className="p-3 text-center">
                      <button
                        onClick={() => handleDeleteLead(lead.id)}
                        className="text-red-500 hover:text-red-700 p-1.5 bg-red-50 hover:bg-red-100 rounded-sm transition-colors text-xs font-bold"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default LeadsPage;