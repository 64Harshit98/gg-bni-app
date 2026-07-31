import { Input } from '../../../Components/ui/input';
import { Label } from '../../../Components/ui/label';
import { indianStates } from '../../../Components/IndianStates';
import type { Address } from '../../../services/catalogue/checkout.service';

const fieldInputClass =
    'w-full bg-muted border border-border rounded-sm p-2 h-auto text-[12px] font-bold text-foreground outline-none shadow-none focus-visible:ring-1';
const fieldLabelClass = 'text-[8px] font-black text-muted-foreground uppercase tracking-widest ml-1';

interface AddressFieldsProps {
    title: string;
    dotClassName: string;
    address: Address;
    onChange: (address: Address) => void;
    namePlaceholder: string;
    disabled?: boolean;
    /** Extra handler fired alongside the phone change (used to mirror billing -> shipping). */
    onPhoneChange?: (value: string) => void;
    containerClassName?: string;
}

/**
 * Shared billing/shipping address form used by the checkout shipping step.
 * Extracted verbatim from `CheckOut.tsx` (previously duplicated for billing
 * and shipping) — same fields, validation and styling, just parameterized.
 */
export function AddressFields({
    title,
    dotClassName,
    address,
    onChange,
    namePlaceholder,
    disabled = false,
    onPhoneChange,
    containerClassName,
}: AddressFieldsProps) {
    return (
        <div
            className={
                containerClassName ??
                `bg-card rounded-sm shadow-sm p-4 border border-gray-50 transition-all ${disabled ? 'opacity-60 pointer-events-none grayscale-[0.5]' : 'opacity-100'
                }`
            }
        >
            <h3 className="text-[9px] font-black text-[#1A3B5D] uppercase tracking-widest mb-3 flex items-center gap-2">
                <span className={`w-1.5 h-1.5 rounded-sm ${dotClassName}`}></span> {title}
            </h3>
            <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1">
                    <Label className={fieldLabelClass}>
                        Full Name<span className="text-red-500 ml-0.5">*</span>
                    </Label>
                    <Input
                        value={address.name}
                        onChange={(e) => onChange({ ...address, name: e.target.value })}
                        type="text"
                        className={fieldInputClass}
                        placeholder={namePlaceholder}
                        disabled={disabled}
                    />
                </div>
                <div className="space-y-1">
                    <Label className={fieldLabelClass}>
                        Phone<span className="text-red-500 ml-0.5">*</span>
                    </Label>
                    <Input
                        value={address.phone}
                        onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                            onChange({ ...address, phone: val });
                            onPhoneChange?.(val);
                        }}
                        type="tel"
                        className={fieldInputClass}
                        placeholder="10 Digits Only"
                        disabled={disabled}
                    />
                </div>
                <div className="space-y-1">
                    <Label className={fieldLabelClass}>
                        City<span className="text-red-500 ml-0.5">*</span>
                    </Label>
                    <Input
                        value={address.city}
                        onChange={(e) => onChange({ ...address, city: e.target.value })}
                        type="text"
                        className={fieldInputClass}
                        placeholder="City"
                        disabled={disabled}
                    />
                </div>
                <div className="space-y-1">
                    <Label className={fieldLabelClass}>
                        State<span className="text-red-500 ml-0.5">*</span>
                    </Label>
                    <select
                        value={address.state}
                        onChange={(e) => onChange({ ...address, state: e.target.value })}
                        disabled={disabled}
                        className={fieldInputClass}
                    >
                        <option value="">Select State</option>
                        {indianStates.map((state) => (
                            <option key={state} value={state}>
                                {state}
                            </option>
                        ))}
                    </select>
                </div>
            </div>
            <div className="mt-3 space-y-1">
                <Label className={fieldLabelClass}>
                    Complete Address<span className="text-red-500 ml-0.5">*</span>
                </Label>
                <textarea
                    value={address.address}
                    onChange={(e) => onChange({ ...address, address: e.target.value })}
                    className="w-full bg-muted border border-border rounded-sm p-2 text-[12px] font-bold h-12 resize-none outline-none overflow-hidden"
                    placeholder="Details..."
                    disabled={disabled}
                ></textarea>
            </div>
            <div className="space-y-1 col-span-2">
                <Label className={fieldLabelClass}>GSTIN (Optional)</Label>
                <Input
                    value={address.gstin || ''}
                    onChange={(e) => {
                        const val = e.target.value.toUpperCase();
                        if (val.length <= 15) {
                            onChange({ ...address, gstin: val });
                        }
                    }}
                    type="text"
                    className={fieldInputClass}
                    placeholder="Enter GSTIN"
                    disabled={disabled}
                />
            </div>
        </div>
    );
}
