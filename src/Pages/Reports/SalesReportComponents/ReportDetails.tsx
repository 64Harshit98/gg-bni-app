
// 1. Define the shape of your props here
interface ReportDetailsProps {
  setIsListVisible: (visible: boolean) => void;
  isListVisible: boolean;
  downloadAsPdf: () => void;
  filteredSales: any[]; // Replace 'any' with your actual Sales type if you have one
  isCatalogueMode?: boolean;
}

export default function ReportDetails({
  setIsListVisible,
  isListVisible,
  downloadAsPdf,
  filteredSales,
  isCatalogueMode = false
}: ReportDetailsProps) { // 2. Apply the interface here
  return (
    <div className="bg-white p-4 rounded-lg shadow-md flex flex-col md:flex-row md:justify-between md:items-center gap-3">
      <h2 className="text-lg font-semibold text-gray-700 text-center md:text-left">Report Details</h2>
      <div className="flex items-stretch gap-3">
        <button
          onClick={() => setIsListVisible(!isListVisible)}
          className="flex-1 md:flex-none px-4 py-2 bg-slate-200 text-slate-800 font-semibold rounded-md hover:bg-slate-300 transition"
        >
          {isListVisible ? 'Hide List' : 'Show List'}
        </button>
        <button
          onClick={downloadAsPdf}
          disabled={filteredSales.length === 0}
          className={`flex-1 md:flex-none px-4 py-2 text-white font-semibold rounded-md shadow-sm
            ${isCatalogueMode
              ? 'bg-[#F97316] hover:bg-orange-700'
              : 'bg-sky-500 hover:bg-sky-700'
            }`}
        >
          Download Report
        </button>
      </div>
    </div>
  );
}