import React from 'react';

/** Circular "efficiency percentile" gauge used on the User Report overview tab. */
const EfficiencyRing: React.FC<{ score: number }> = ({ score }) => {
  const r = 52;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  return (
    <svg width={140} height={140} viewBox="0 0 140 140">
      <circle cx={70} cy={70} r={r} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth={12} />
      <circle cx={70} cy={70} r={r} fill="none" stroke="white" strokeWidth={12}
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round" transform="rotate(-90 70 70)" />
      <text x={70} y={65} textAnchor="middle" fill="white" fontSize={30} fontWeight={700} fontFamily="sans-serif">{score}</text>
      <text x={70} y={82} textAnchor="middle" fill="rgba(255,255,255,0.75)" fontSize={10} fontFamily="sans-serif" letterSpacing={1}>PERCENTILE</text>
    </svg>
  );
};

export default EfficiencyRing;
