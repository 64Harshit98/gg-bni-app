import { useNavigate } from "react-router";

interface BackButtonProps {
  className?: string;
  to?: string; // optional route (like ORDERDETAILS)
}

const BackButton: React.FC<BackButtonProps> = ({ className = "", to }) => {
  const navigate = useNavigate();

  const handleClick = () => {
    if (to) {
      navigate(to);
    } else {
      navigate(-1);
    }
  };

  return (
    <button
      onClick={handleClick}
      title="Back"
      className={`p-2
                  text-slate-700 
                  hover:bg-slate-200 
                  transition-colors 
                  ${className}`}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <line x1="19" y1="12" x2="5" y2="12" />
        <polyline points="12 19 5 12 12 5" />
      </svg>
    </button>
  );
};

export default BackButton;