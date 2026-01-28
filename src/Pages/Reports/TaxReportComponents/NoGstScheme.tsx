import { useNavigate } from 'react-router';
import { IconClose } from '../../../constants/Icons';

export default function NoGstScheme() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-gray-100 p-2 pb-16 flex flex-col">
      <div className="flex items-center justify-between pb-3 border-b mb-2">
        <h1 className="flex-1 text-xl text-center font-bold text-gray-800">
          Tax Liability Report
        </h1>
        <button
          onClick={() => navigate(-1)}
          className="p-2 text-gray-600 hover:bg-gray-200 rounded-full"
        >
          <IconClose width={20} height={20} />
        </button>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <div className="bg-gray-200 p-6 rounded-full mb-4">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-12 w-12 text-gray-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
            />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-gray-700 mb-2">
          Tax Reports Disabled
        </h2>
        <p className="text-gray-500 max-w-md mb-6">
          Your current settings have GST disabled (Scheme: None). Please enable
          GST in Settings to view tax reports.
        </p>
      </div>
    </div>
  );
}
