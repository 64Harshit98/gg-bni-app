export default function ReportDetails({
  setIsListVisible,
  isListVisible,
  downloadAsPdf,
  filteredSales,
}) {
  return (
    <div className="bg-white p-4 rounded-lg shadow-md flex justify-between items-center">
      <h2 className="text-lg font-semibold text-gray-700">Report Details</h2>
      <div className="flex items-center space-x-3">
        <button
          onClick={() => setIsListVisible(!isListVisible)}
          className="px-4 py-2 bg-slate-200 text-slate-800 font-semibold rounded-md hover:bg-slate-300 transition"
        >
          {isListVisible ? 'Hide List' : 'Show List'}
        </button>
        <button
          onClick={downloadAsPdf}
          disabled={filteredSales.length === 0}
          className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-md shadow-sm hover:bg-blue-700 "
        >
          Download PDF
        </button>
      </div>
    </div>
  );
}
