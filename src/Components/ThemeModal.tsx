import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { State } from '../enums';

interface Props {
  type: State;
  message: string;
  onClose: () => void;
  showConfirmButton?: boolean;
  onConfirm?: () => void;
  theme?: 'blue' | 'orange';
}

// Same API as constants/Modal, but follows the blue (POS) / orange (Catalogue) theme.
export const ThemedModal = ({ type, message, onClose, showConfirmButton = false, onConfirm, theme = 'blue' }: Props) => {
  const orange = theme === 'orange';
  const primaryBtn = orange ? 'bg-orange-700 hover:bg-orange-800' : 'bg-blue-600 hover:bg-blue-700';
  const iconBox = orange ? 'bg-orange-100' : 'bg-blue-50';

  const icon =
    type === State.ERROR ? <X size={22} className="text-red-600" />
    : type === State.WARNING ? <AlertTriangle size={22} className="text-amber-600" />
    : type === State.SUCCESS ? <CheckCircle2 size={22} className="text-green-600" />
    : <Info size={22} className={orange ? 'text-orange-700' : 'text-blue-600'} />;

  return (
    <div className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-sm bg-white p-6 text-center shadow-float">
        <span className={`mx-auto flex h-11 w-11 items-center justify-center rounded-sm ${iconBox}`}>{icon}</span>
        <p className="mt-4 text-sm leading-relaxed text-slate-800">{message}</p>
        <div className="mt-5 flex gap-2">
          {showConfirmButton && (
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-sm border border-slate-300 bg-white py-2.5 text-sm font-medium text-slate-700 hover:border-slate-400"
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            onClick={showConfirmButton ? onConfirm : onClose}
            className={`flex-1 rounded-sm py-2.5 text-sm font-semibold text-white transition ${primaryBtn}`}
          >
            {showConfirmButton ? 'Confirm' : 'OK'}
          </button>
        </div>
      </div>
    </div>
  );
};