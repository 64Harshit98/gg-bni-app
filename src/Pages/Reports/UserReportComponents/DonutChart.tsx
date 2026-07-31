import React from 'react';

/** Payment-method breakdown donut used on the User Report overview tab. */
const DonutChart: React.FC<{ cash: number; upi: number; card: number; total: number }> = ({
  cash,
  upi,
  card,
  total,
}) => {
  if (total === 0) {
    return (
      <svg width={140} height={140} viewBox="0 0 140 140" className="flex-shrink-0">
        <circle cx={70} cy={70} r={52} fill="none" stroke="#e5e7eb" strokeWidth={20} />
        <circle cx={70} cy={70} r={40} fill="white" />
        <text x={70} y={75} textAnchor="middle" fill="#9ca3af" fontSize={12} fontFamily="sans-serif">No data</text>
      </svg>
    );
  }
  const r = 52;
  const circ = 2 * Math.PI * r;
  const cardArc = (card / total) * circ;
  const upiArc = (upi / total) * circ;
  const cashArc = (cash / total) * circ;
  return (
    <svg width={140} height={140} viewBox="0 0 140 140" className="flex-shrink-0">
      <circle cx={70} cy={70} r={r} fill="none" stroke="#2563eb" strokeWidth={20}
        strokeDasharray={`${cardArc} ${circ - cardArc}`} strokeDashoffset={0}
        transform="rotate(-90 70 70)" />
      <circle cx={70} cy={70} r={r} fill="none" stroke="#6b7280" strokeWidth={20}
        strokeDasharray={`${upiArc} ${circ - upiArc}`} strokeDashoffset={-cardArc}
        transform="rotate(-90 70 70)" />
      <circle cx={70} cy={70} r={r} fill="none" stroke="#d1d5db" strokeWidth={20}
        strokeDasharray={`${cashArc} ${circ - cashArc}`} strokeDashoffset={-(cardArc + upiArc)}
        transform="rotate(-90 70 70)" />
      <circle cx={70} cy={70} r={40} fill="white" />
      <text x={70} y={66} textAnchor="middle" fill="#6b7280" fontSize={9} fontFamily="sans-serif" letterSpacing={1}>NET REV</text>
      <text x={70} y={82} textAnchor="middle" fill="#111827" fontSize={15} fontWeight={700} fontFamily="sans-serif">
        Rs.{(total / 1000).toFixed(1)}k
      </text>
    </svg>
  );
};

export default DonutChart;
