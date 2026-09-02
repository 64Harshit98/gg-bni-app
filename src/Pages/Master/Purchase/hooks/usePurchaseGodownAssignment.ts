import { useState, useMemo } from 'react';
import { useGodowns } from '../../../hooks/useStockTransfer';
import type { AssignableItem, GodownSplit } from '../../../../Components/PurchaseGodownAssign';
import type { PurchaseItem } from '../purchase.types';

interface UsePurchaseGodownAssignmentParams {
    currentUser: any;
    items: PurchaseItem[];
}

// Owns the Purchase-specific godown assignment subsystem — moved verbatim
// from Purchase.tsx: the useGodowns wiring, isGodownAssignOpen,
// godownAssignments, assignableItemsForGodown (the useMemo), and
// handleGodownAssignConfirm. No Sales equivalent — this only exists on the
// Purchase side.
//
// `isDrawerOpen`/`setIsDrawerOpen` (the PaymentDrawer's open state) also live
// here, NOT in usePurchasePayment, even though handleProceedToPayment (in
// usePurchasePayment) is what usually opens it. Reason: handleProceedToPayment
// needs `godowns` + `setIsGodownAssignOpen` from THIS hook to decide whether
// to open the godown-assign modal first; and handleGodownAssignConfirm (here)
// needs to open the payment drawer once godown assignment is confirmed. If
// isDrawerOpen lived in usePurchasePayment, the two hooks would need each
// other's output at hook-creation time (a real circular dependency, since
// Purchase.tsx would need to call both before either exists). Keeping
// isDrawerOpen here and threading `setIsDrawerOpen` (plus `godowns` and
// `setIsGodownAssignOpen`) into usePurchasePayment as plain params avoids
// that cycle — this hook doesn't need anything back from usePurchasePayment.
// Behavior is unchanged; only which file declares the state.
export const usePurchaseGodownAssignment = ({
    currentUser,
    items,
}: UsePurchaseGodownAssignmentParams) => {
    const { godowns } = useGodowns(currentUser?.companyId);
    const [isGodownAssignOpen, setIsGodownAssignOpen] = useState(false);
    const [godownAssignments, setGodownAssignments] = useState<Record<string, GodownSplit[]>>({}); // cartItemId -> destination splits
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);

    const assignableItemsForGodown: AssignableItem[] = useMemo(() => {
        // One row per cart line (not merged by product) so duplicate entries of the
        // same item — e.g. added twice in the cart — can be assigned to different
        // destinations independently, exactly as they appear in the cart.
        return items.map(item => ({
            id: item.id,
            name: item.name,
            quantity: item.quantity || 1,
            unit: item.unit,
        }));
    }, [items]);

    const handleGodownAssignConfirm = (assignments: Record<string, GodownSplit[]>) => {
        setGodownAssignments(assignments);
        setIsGodownAssignOpen(false);
        setIsDrawerOpen(true);
    };

    return {
        godowns,
        isGodownAssignOpen, setIsGodownAssignOpen,
        godownAssignments, setGodownAssignments,
        isDrawerOpen, setIsDrawerOpen,
        assignableItemsForGodown,
        handleGodownAssignConfirm,
    };
};
