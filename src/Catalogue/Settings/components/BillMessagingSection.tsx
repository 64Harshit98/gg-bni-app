import { MessageCircle, FileText } from 'lucide-react';
import { Textarea } from '../../../Components/ui/textarea';
import { Label } from '../../../Components/ui/label';
import { SettingsCard } from './SettingsCard';

interface BillMessagingSectionProps {
  whatsappExtraMessage: string;
  onWhatsappExtraMessageChange: (value: string) => void;
  termsAndConditions: string;
  onTermsAndConditionsChange: (value: string) => void;
}

/** WhatsApp follow-up message and printed terms & conditions footer. */
export function BillMessagingSection({
  whatsappExtraMessage,
  onWhatsappExtraMessageChange,
  termsAndConditions,
  onTermsAndConditionsChange,
}: BillMessagingSectionProps) {
  return (
    <>
      <SettingsCard title="WhatsApp Message" icon={<MessageCircle className="size-4" />}>
        <p className="-mt-2 text-xs text-muted-foreground">
          Add an extra message to send along with your invoices on WhatsApp.
        </p>
        <Label htmlFor="whatsappExtraMessage" className="sr-only">
          WhatsApp message
        </Label>
        <Textarea
          id="whatsappExtraMessage"
          name="whatsappExtraMessage"
          value={whatsappExtraMessage}
          onChange={(e) => onWhatsappExtraMessageChange(e.target.value)}
          placeholder="e.g., Thank you for shopping with us! Please leave a Google review."
          rows={3}
          className="text-sm leading-relaxed"
        />
      </SettingsCard>

      <SettingsCard title="Terms & Conditions" icon={<FileText className="size-4" />}>
        <p className="-mt-2 text-xs text-muted-foreground">Printed at the footer of every invoice.</p>
        <Label htmlFor="termsAndConditions" className="sr-only">
          Terms and conditions
        </Label>
        <Textarea
          id="termsAndConditions"
          name="termsAndConditions"
          value={termsAndConditions}
          onChange={(e) => onTermsAndConditionsChange(e.target.value)}
          rows={5}
          className="text-sm leading-relaxed"
        />
      </SettingsCard>
    </>
  );
}
