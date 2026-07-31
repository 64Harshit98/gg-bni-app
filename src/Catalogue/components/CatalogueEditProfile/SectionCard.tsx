import * as React from 'react';

interface SectionCardProps {
  title: string;
  children: React.ReactNode;
}

export const SectionCard: React.FC<SectionCardProps> = ({ title, children }) => (
  <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm transition-shadow hover:shadow-md">
    <div className="flex items-center gap-2 border-b border-border bg-gradient-to-r from-primary/5 to-transparent px-4 py-2.5">
      <span className="size-1.5 rounded-full bg-gradient-to-br from-primary to-fuchsia-500" />
      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{title}</span>
    </div>
    <div className="flex-1 p-4">{children}</div>
  </div>
);

interface LabeledFieldProps {
  label: string;
  children: React.ReactNode;
}

export const LabeledField: React.FC<LabeledFieldProps> = ({ label, children }) => (
  <div className="flex flex-col gap-0.5">
    <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</label>
    {children}
  </div>
);
