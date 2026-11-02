import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

interface BackButtonProps {
  className?: string;
  /** Optional route to go to; defaults to browser history back. */
  to?: string;
  onClick?: () => void;
}

const BackButton = ({ className = '', to, onClick }: BackButtonProps) => {
  const navigate = useNavigate();

  const handleClick = () => {
    if (onClick) {
      onClick();
      return;
    }
    if (to) {
      navigate(to);
    } else {
      navigate(-1);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      title="Back"
      aria-label="Back"
      className={`flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-sm text-slate-700 transition-colors hover:bg-slate-200 ${className}`}
    >
      <ArrowLeft size={22} strokeWidth={2.5} />
    </button>
  );
};

export default BackButton;