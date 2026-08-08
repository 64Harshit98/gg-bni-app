export const formatDate = (date: Date): string => {
    if (!date) return 'N/A';
    return date.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit'
    });
};

export const formatAmount = (amount: number) => {
    return Number(amount || 0).toLocaleString('en-IN');
};

export const getDateRange = (
    filter: string,
    customStart?: Date | null,
    customEnd?: Date | null
) => {
    const end = new Date();
    end.setHours(23, 59, 59, 999);

    const start = new Date();
    start.setHours(0, 0, 0, 0);

    switch (filter) {
        case 'today':
            return { start, end };

        case 'yesterday': {
            start.setDate(start.getDate() - 1);
            end.setDate(end.getDate() - 1);
            return { start, end };
        }

        case 'last7': {
            // FIX HERE (7 days total including today)
            start.setDate(start.getDate() - 6);
            return { start, end };
        }

        case 'last30': {
            // Same logic (30 days total)
            start.setDate(start.getDate() - 29);
            return { start, end };
        }

        case 'custom':
            return {
                start: customStart
                    ? new Date(new Date(customStart).setHours(0, 0, 0, 0))
                    : start,
                end: customEnd
                    ? new Date(new Date(customEnd).setHours(23, 59, 59, 999))
                    : end,
            };

        default:
            return { start, end };
    }
};
