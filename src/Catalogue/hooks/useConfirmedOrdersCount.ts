import { useMemo } from "react";
import { useOrdersData } from "../Orders";

export const useConfirmedOrdersCount = (companyId?: string) => {

    const todayStart = new Date();
    todayStart.setHours(0,0,0,0);

    const todayEnd = new Date();
    todayEnd.setHours(23,59,59,999);

    const { Orders } = useOrdersData(companyId, todayStart, todayEnd);

    return useMemo(() => {
        return Orders.filter(o => o.status === "Confirmed").length;
    }, [Orders]);
};