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
