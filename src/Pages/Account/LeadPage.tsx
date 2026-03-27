import { useEffect, useState, useMemo } from "react";

import { useNavigate } from "react-router-dom";

import { collection, getDocs } from "firebase/firestore";

import { db } from "../../lib/Firebase";

import { IconClose } from "../../constants/Icons";

import { CustomCard } from "../../Components/CustomCard";

import { CardVariant } from "../../enums";



type LeadType = {

  id: string;

  email?: string;

  fullName?: string;

  phoneNumber?: string;

  currentStep?: string;

  status?: string;

  lastUpdated?: any;

};



type FilterType = "all" | "Registration" | "Trial Plan" | "Abandoned";



// Helper defined outside component so it can be used for initial state
const toDateStr = (date: Date) => date.toISOString().split("T")[0];



function LeadsPage() {

  const navigate = useNavigate();

  const [leads, setLeads] = useState<LeadType[]>([]);

  const [activeFilter, setActiveFilter] = useState<FilterType>("all");

  const [datePreset, setDatePreset] = useState("today");



  // ✅ FIX 1: Initialize start/end dates to today immediately
  const [customStartDate, setCustomStartDate] = useState(() => toDateStr(new Date()));

  const [customEndDate, setCustomEndDate] = useState(() => toDateStr(new Date()));



  // ✅ FIX 2: Initialize appliedFilters to today's range so filter works on load
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

      // "today" — start and end are already today

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

    // ✅ Reset status filter when date range changes so user starts fresh

    setActiveFilter("all");

  };



  useEffect(() => {

    const fetchLeads = async () => {

      const snap = await getDocs(collection(db, "leads"));

      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as LeadType[];

      setLeads(list);

    };

    fetchLeads();

  }, []);



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



  // ✅ FIX 3: Date-filtered leads (no status filter) — used for stats cards
  const dateFilteredLeads = useMemo(() => {

    return leads.filter(lead => {

      if (!lead.lastUpdated) return false;

      const date =

        typeof lead.lastUpdated.toDate === "function"

          ? lead.lastUpdated.toDate()

          : new Date(lead.lastUpdated);

      return (

        date.getTime() >= appliedFilters.start &&

        date.getTime() <= appliedFilters.end

      );

    });

  }, [leads, appliedFilters]);



  // ✅ FIX 4: Stats always reflect the active date range (not all leads)
  const stats = useMemo(() => ({

    total: dateFilteredLeads.length,

    registration: dateFilteredLeads.filter(l => l.status === "Registration").length,

    trial: dateFilteredLeads.filter(l => l.status === "Trial Plan").length,

    abandoned: dateFilteredLeads.filter(l => l.status === "Abandoned").length,

  }), [dateFilteredLeads]);



  // ✅ FIX 5: Table applies status filter on top of already date-filtered leads
  const filteredLeads = useMemo(() => {

    if (activeFilter === "all") return dateFilteredLeads;

    return dateFilteredLeads.filter(l => l.status === activeFilter);

  }, [dateFilteredLeads, activeFilter]);



  const toggleFilter = (f: FilterType) =>

    setActiveFilter(prev => (prev === f ? "all" : f));



  return (

    <div className="min-h-screen bg-gray-100 p-4 md:p-8 pb-16">



      {/* HEADER */}

      <div className="flex items-center justify-between pb-3 border-b mb-2">

        <h1 className="flex-1 text-xl text-center font-bold text-gray-800">

          App Leads

        </h1>

        <button onClick={() => navigate(-1)} className="p-2">

          <IconClose width={20} height={20} />

        </button>

      </div>



      {/* DATE FILTER */}

      <div className="bg-white p-4 rounded-sm shadow-md mb-2">

        <div className="grid grid-cols-1 gap-3">

          <select

            value={datePreset}

            onChange={(e) => handleDatePresetChange(e.target.value)}

            className="w-full p-2 text-sm bg-gray-50 border rounded-sm"

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

              className="w-full p-2 text-sm bg-gray-50 border rounded-sm"

            />

            <input

              type="date"

              value={customEndDate}

              onChange={(e) => { setCustomEndDate(e.target.value); setDatePreset("custom"); }}

              className="w-full p-2 text-sm bg-gray-50 border rounded-sm"

            />

          </div>

        </div>



        <div className="flex justify-center mt-2">

          <button

            onClick={handleApplyFilters}

            className="w-full md:w-fit mt-2 px-10 py-2 bg-blue-600 text-white text-lg font-semibold rounded-sm hover:bg-blue-700"

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
              ? "border-gray-600 bg-gray-100 shadow-md scale-105"
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
      {/* TABLE */}

      <div className="bg-white p-4 rounded-sm shadow-md mb-2">

        <div className="overflow-x-auto">

          <table className="w-full min-w-[700px] text-sm">

            <thead className="bg-gray-50 text-gray-600">

              <tr>

                <th className="p-3 text-left">Name</th>

                <th className="p-3 text-left">Email</th>

                <th className="p-3 text-left">Phone</th>

                <th className="p-3 text-left">Current Step</th>

                <th className="p-3 text-left">Last Updated</th>

              </tr>
            </thead>

            <tbody>

              {filteredLeads.length === 0 ? (

                <tr>

                  <td colSpan={5} className="p-6 text-center text-gray-400">No leads found.</td>

                </tr>

              ) : (

                filteredLeads.map((lead) => (

                  <tr key={lead.id} className="border-t">

                    <td className="p-3">{lead.fullName || "-"}</td>

                    <td className="p-3">{lead.email || "-"}</td>

                    <td className="p-3">{lead.phoneNumber || "-"}</td>

                    <td className="p-3">{lead.currentStep || "-"}</td>

                    <td className="p-3">{formatDate(lead.lastUpdated)}</td>

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