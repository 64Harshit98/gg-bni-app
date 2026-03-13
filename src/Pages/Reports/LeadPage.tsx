import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../lib/Firebase";

import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

import { IconClose } from "../../constants/Icons";
import FilterSelect from "./PurchaseReportComponents/FilterSelect";
import { CustomCard } from "../../Components/CustomCard";
import { CardVariant, State } from "../../enums";

import DownloadChoiceModal from "./ItemReportComponents/DownloadChoiceModal";
import { Modal } from "../../constants/Modal";

type LeadType = {
  id: string;
  email?: string;
  fullName?: string;
  phoneNumber?: string;
  currentStep?: string;
  status?: string;
  lastUpdated?: any;
};

function LeadsPage() {

  const navigate = useNavigate();
  const [leads, setLeads] = useState<LeadType[]>([]);
  const [statusFilter] = useState("all");
  const [datePreset, setDatePreset] = useState("today");
    const [customStartDate, setCustomStartDate] = useState("");
    const [customEndDate, setCustomEndDate] = useState("");
    const [appliedFilters, setAppliedFilters] = useState<any>(null);
  const [isListVisible, setIsListVisible] = useState(true);
  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);

    const [feedbackModal, setFeedbackModal] = useState({
        isOpen: false,
        type: State.INFO,
        message: ""
    });
    const formatDateForInput = (date: Date) => {
    return date.toISOString().split("T")[0];
    };

    const handleDatePresetChange = (preset: string) => {

    setDatePreset(preset);

    const start = new Date();
    const end = new Date();

    switch (preset) {
        case "today":
        break;
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
        case "custom":
        return;
    }
    setCustomStartDate(formatDateForInput(start));
    setCustomEndDate(formatDateForInput(end));
    };

    const handleApplyFilters = () => {
    const start = customStartDate ? new Date(customStartDate) : new Date(0);
    start.setHours(0,0,0,0);

    const end = customEndDate ? new Date(customEndDate) : new Date();
    end.setHours(23,59,59,999);

    setAppliedFilters({
        start: start.getTime(),
        end: end.getTime()
    });
    };

  useEffect(() => {

    const fetchLeads = async () => {
      const snap = await getDocs(collection(db, "leads"));
      const list = snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as LeadType[];
      setLeads(list);
    };
    fetchLeads();
  }, []);

  const formatDate = (timestamp: any) => {
    if (!timestamp) return "--";

    const date =
      typeof timestamp.toDate === "function"
        ? timestamp.toDate()
        : new Date(timestamp);

    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = String(date.getFullYear()).slice(-2); // 2 digit year

    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");

    return `${day}/${month}/${year} ${hours}:${minutes}`;
  };

  // STATUS FILTER
  let filteredLeads =
    statusFilter === "all"
      ? leads
      : leads.filter(l => l.status === statusFilter);

  // DATE FILTER
    if (appliedFilters) {
    filteredLeads = filteredLeads.filter((lead) => {
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

    }

  const onboarding = leads.filter(l => l.status === "Onboarding").length;
  const trial = leads.filter(l => l.status === "Trial Plan").length;
  const abandoned = leads.filter(l => l.status === "Abandoned").length;

  // 📊 Excel Download
  const downloadAsExcel = () => {
    const data = filteredLeads.map((lead) => ({
      Name: lead.fullName || "",
      Email: lead.email || "",
      Phone: lead.phoneNumber || "",
      Step: lead.currentStep || "",
      Status: lead.status || "",
      Updated: formatDate(lead.lastUpdated),
    }));
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Leads");
    const buffer = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "array",
    });
    const blob = new Blob([buffer]);
    saveAs(blob, "leads_report.xlsx");
  };

  // 📄 PDF Download
  const downloadAsPdf = () => {

    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text("Leads Report", 14, 22);
    doc.setFontSize(11);
    doc.setTextColor(100);

    const today = new Date();
    const day = String(today.getDate()).padStart(2, "0");
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const year = String(today.getFullYear()).slice(-2);

    doc.text(`Date: ${day}/${month}/${year}`, 14, 30);    
    
    const tableData = filteredLeads.map((lead) => [
      lead.fullName || "",
      lead.email || "",
      lead.phoneNumber || "",
      lead.currentStep || "",
      lead.status || "",
      formatDate(lead.lastUpdated),
    ]);

    autoTable(doc, {
      startY: 35,
      head: [["Name","Email","Phone","Step","Status","Updated"]],
      body: tableData,
      theme:"grid",
      headStyles: { fillColor: [41, 128, 185] },
      footStyles: { fontStyle: 'bold' , fillColor: [41, 128, 185]},
    });
    
    doc.save("leads_report.pdf");
  };

  return (

    <div className="min-h-screen bg-gray-100 p-2 pb-16">
        {feedbackModal.isOpen && (
            <Modal
                type={feedbackModal.type}
                message={feedbackModal.message}
                onClose={() => setFeedbackModal((p) => ({ ...p, isOpen: false }))}
                showConfirmButton={false}
            />
        )}
        <DownloadChoiceModal
            isOpen={isDownloadModalOpen}
            onClose={() => setIsDownloadModalOpen(false)}
            onDownloadPdf={downloadAsPdf}
            onDownloadExcel={downloadAsExcel}
        />

      {/* HEADER */}
      <div className="flex items-center justify-between pb-3 border-b mb-2">
        <h1 className="flex-1 text-xl text-center font-bold text-gray-800">
          Website / App Leads
        </h1>
        <button onClick={() => navigate(-1)} className="p-2">
          <IconClose width={20} height={20} />
        </button>
      </div>

      {/* FILTER */}
       <div className="bg-white p-4 rounded-lg shadow-md mb-2">
         <div className="grid grid-cols-1 gap-3">
           <FilterSelect
             value={datePreset}
             onChange={(e) => handleDatePresetChange(e.target.value)}
           >
             <option value="today">Today</option>
             <option value="yesterday">Yesterday</option>
             <option value="last7">Last 7 Days</option>
             <option value="last30">Last 30 Days</option>
             <option value="custom">Custom</option>
           </FilterSelect>
 
           <div className="grid grid-cols-2 gap-4">
             <input
               type="date"
               value={customStartDate}
               onChange={(e) => {
                 setCustomStartDate(e.target.value);
                 setDatePreset('custom');
               }}
               className="w-full p-2 text-sm bg-gray-50 border rounded-md"
             />
             <input
               type="date"
               value={customEndDate}
               onChange={(e) => {
                 setCustomEndDate(e.target.value);
                 setDatePreset('custom');
               }}
               className="w-full p-2 text-sm bg-gray-50 border rounded-md"
             />
           </div>
         </div>
 
         <div className="flex justify-center mt-2">
           <button onClick={handleApplyFilters}
             className="w-full md:w-fit mt-2 px-10 py-2 bg-blue-600 text-white text-lg font-semibold rounded-lg hover:bg-blue-700" >
             Apply
           </button>
         </div>
       </div>

      {/* SUMMARY */}

      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2 mb-2">
        <CustomCard
          className="py-10"
          variant={CardVariant.Summary}
          title="Total Leads"
          value={leads.length}
        />

        <CustomCard
          className="py-10"
          variant={CardVariant.Summary}
          title="Onboarding"
          value={onboarding}
        />

        <CustomCard
          className="py-10"
          variant={CardVariant.Summary}
          title="Trial Plan"
          value={trial}
        />

        <CustomCard
          className="py-10"
          variant={CardVariant.Summary}
          title="Abandoned"
          value={abandoned}
        />
        </div>

      {/* REPORT HEADER */}

      <div className="bg-white p-4 rounded-lg shadow-md flex flex-col md:flex-row md:justify-between md:items-center gap-3 mb-2">
        <h2 className="text-lg font-semibold text-gray-700 text-center md:text-left w-full md:w-auto">Report Details</h2>
        <div className="flex justify-between w-full md:w-auto md:justify-end md:space-x-3 ">          
          <button
            onClick={() => setIsListVisible(!isListVisible)}
            className="px-4 py-2 bg-slate-200 text-slate-800 font-semibold rounded-md hover:bg-slate-300 transition"
          >
            {isListVisible ? 'Hide List' : 'Show List'}
          </button>
          <button
            onClick={() => {
              if (filteredLeads.length === 0) {
                setFeedbackModal({
                    isOpen: true,
                    type: State.INFO,
                    message: 'No data available to download.',
                });
              } else {
                setIsDownloadModalOpen(true);
              }
            }}
            className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-md shadow-sm hover:bg-blue-700 transition"
          >
            Download Report
          </button>
        </div>
      </div>

      {/* TABLE */}
      <div className="bg-white p-4 rounded-lg shadow-md mb-2">
        {isListVisible && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="p-3 text-left">Name</th>
                  <th className="p-3 text-left">Email</th>
                  <th className="p-3 text-left">Phone</th>
                  <th className="p-3 text-left">Current Step</th>
                  <th className="p-3 text-left">Status</th>
                  <th className="p-3 text-left">Last Updated</th>
                </tr>
              </thead>
              <tbody>
                {filteredLeads.map((lead)=>(
                  <tr key={lead.id} className="border-t">
                    <td className="p-3">{lead.fullName || "-"}</td>
                    <td className="p-3">{lead.email || "-"}</td>
                    <td className="p-3">{lead.phoneNumber || "-"}</td>
                    <td className="p-3">{lead.currentStep || "-"}</td>
                    <td className="p-3">{lead.status || "-"}</td>
                    <td className="p-3">{formatDate(lead.lastUpdated)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
export default LeadsPage;