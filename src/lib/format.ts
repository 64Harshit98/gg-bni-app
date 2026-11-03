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

// Clock time for bill and order lists: "2:46 pm"
export const formatClockTime = (date: Date): string =>
    date.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });

// Spelled out because the en-IN locale writes September as "Sept"
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Day label for bill and order lists: "Today", "Yesterday", "26 Sep" ("26 Sep 2025" for another year)
export const formatDayLabel = (date: Date, now: Date = new Date()): string => {
    const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const daysAgo = Math.round((startOfDay(now) - startOfDay(date)) / 86400000);
    if (daysAgo === 0) return 'Today';
    if (daysAgo === 1) return 'Yesterday';
    const dayMonth = `${date.getDate()} ${SHORT_MONTHS[date.getMonth()]}`;
    return date.getFullYear() === now.getFullYear() ? dayMonth : `${dayMonth} ${date.getFullYear()}`;
};

// "Today, 10:42 am" / "26 Sep, 2:46 pm"
export const formatDayTime = (date: Date, now: Date = new Date()): string =>
    `${formatDayLabel(date, now)}, ${formatClockTime(date)}`;
