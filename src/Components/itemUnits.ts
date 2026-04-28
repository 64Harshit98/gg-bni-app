// constants/itemUnits.ts

export const UNIT_OPTIONS = [
  { value: 'pcs', label: 'Pieces (1 pcs)' },
  { value: 'box', label: 'Box (10 pcs)' },
  { value: 'pkt', label: 'Packet (Custom)' },
  { value: 'doz', label: 'Dozen (12 pcs)' },
  { value: 'qt',  label: 'Quintal (100 pcs)' },
  { value: 'ton', label: 'Ton (1000 pcs)' },
];

export const getUnitMultiplier = (unit: string, packetSize: string): number => {
  if (unit === 'box') return 10;
  if (unit === 'doz') return 12;
  if (unit === 'qt')  return 100;
  if (unit === 'ton') return 1000;
  if (unit === 'pkt') return parseInt(packetSize, 10) || 1;
  return 1;
};

export const getUnitLabel = (itemUnit: string, packetSize: string): string => {
  if (itemUnit === 'box') return '10 pcs';
  if (itemUnit === 'doz') return '12 pcs';
  if (itemUnit === 'qt')  return '100 pcs';
  if (itemUnit === 'ton') return '1000 pcs';
  if (itemUnit === 'pkt') return `${packetSize || 1} pcs`;
  return '1 pcs';
};
