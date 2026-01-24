import { IconClose } from '../../../constants/Icons';
export default function DownloadChoiceModal({
  isOpen,
  onClose,
  onDownloadPdf,
  onDownloadExcel,
}: {
  isOpen: boolean;
  onClose: () => void;
  onDownloadPdf: () => void;
  onDownloadExcel: () => void;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4 animate-fade-in">
      <div className="bg-white rounded-sm shadow-2xl p-6 w-full max-w-sm text-center relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <IconClose width={20} height={20} />
        </button>

        <h3 className="text-xl font-bold text-gray-800 mb-2">
          Download Report
        </h3>
        <p className="text-gray-600 mb-6">Select your preferred format.</p>

        <div className="flex flex-col gap-3">
          <button
            onClick={() => {
              onDownloadExcel();
            }}
            className="w-full bg-green-600 text-white py-3 px-4 rounded-lg hover:bg-green-700 transition-colors font-medium flex items-center justify-center gap-2"
          >
            <span>Export as Excel</span>
          </button>

          <button
            onClick={() => {
              onDownloadPdf();
            }}
            className="w-full bg-red-600 text-white py-3 px-4 rounded-lg hover:bg-red-700 transition-colors font-medium flex items-center justify-center gap-2"
          >
            <span>Export as PDF</span>
          </button>
        </div>
      </div>
    </div>
  );
}
