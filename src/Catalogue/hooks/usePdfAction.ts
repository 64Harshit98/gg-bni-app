import { useState } from 'react';

export type BillType = 'estimate' | 'bill';

export interface UsePdfActionReturn {
  /** ID of the record currently generating a PDF, or null. */
  pdfLoadingId: string | null;
  /** Whether any PDF is currently generating. */
  isGenerating: boolean;
  /** The item awaiting an action selection (print/download/whatsapp). */
  pendingActionItem: any | null;
  /** Current bill-type toggle selection. */
  billType: BillType;
  setBillType: (v: BillType) => void;
  /** Show the action-selection modal for a record. */
  openActionModal: (item: any) => void;
  /** Close / cancel the action-selection modal. */
  closeActionModal: () => void;
  /**
   * Wrap any async PDF operation so the loading ID is set/cleared
   * automatically and errors are caught.
   *
   * @param id      - The record ID (used to show a spinner on that row).
   * @param fn      - The async PDF action to run.
   * @param onError - Optional error callback.
   */
  run: (id: string, fn: () => Promise<void>, onError?: (err: unknown) => void) => Promise<void>;
}

/**
 * Centralises PDF generation state shared by Journal and OrdersPage.
 *
 * Responsibilities:
 *  - Track which record is generating (`pdfLoadingId`)
 *  - Hold the item waiting for an action-modal selection (`pendingActionItem`)
 *  - Manage the estimate/bill toggle (`billType`)
 *
 * Usage:
 * ```tsx
 * const pdf = usePdfAction();
 *
 * // Open action modal on Print button click:
 * <button onClick={() => pdf.openActionModal(invoice)}>Print</button>
 *
 * // Inside the action modal confirm:
 * pdf.run(invoice.id, () => generatePdf(data, ACTION.DOWNLOAD));
 * ```
 */
export const usePdfAction = (): UsePdfActionReturn => {
  const [pdfLoadingId, setPdfLoadingId] = useState<string | null>(null);
  const [pendingActionItem, setPendingActionItem] = useState<any | null>(null);
  const [billType, setBillType] = useState<BillType>('estimate');

  const isGenerating = pdfLoadingId !== null;

  const openActionModal = (item: any) => setPendingActionItem(item);
  const closeActionModal = () => setPendingActionItem(null);

  const run = async (
    id: string,
    fn: () => Promise<void>,
    onError?: (err: unknown) => void
  ) => {
    setPdfLoadingId(id);
    try {
      await fn();
    } catch (err) {
      console.error('[usePdfAction] PDF generation error:', err);
      onError?.(err);
    } finally {
      setPdfLoadingId(null);
    }
  };

  return {
    pdfLoadingId,
    isGenerating,
    pendingActionItem,
    billType,
    setBillType,
    openActionModal,
    closeActionModal,
    run,
  };
};
