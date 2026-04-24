import React from 'react';

interface SectionCardProps {
  title: string;
  icon?: string;
  children: React.ReactNode;
}

const SectionCard: React.FC<SectionCardProps> = ({ title, icon, children }) => (
  <div className="bg-white rounded-sm border border-slate-100 shadow-sm overflow-hidden flex flex-col">
    <div className="px-3 py-2 border-b border-slate-100 flex items-center gap-2">
      {icon && <span className="text-xs">{icon}</span>}
      <span className="text-[9px] font-bold tracking-widest uppercase text-slate-500">
        {title}
      </span>
    </div>
    <div className="p-4 flex-1">{children}</div>
  </div>
);

export default SectionCard;