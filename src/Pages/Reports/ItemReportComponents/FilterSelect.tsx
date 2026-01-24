export default function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex-1 min-w-0">
      <label className="block text-xs text-center font-medium text-gray-600 mb-1">
        {label}
      </label>
      <select
        value={value}
        onChange={onChange}
        className="w-full p-2 text-sm text-center bg-gray-50 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
      >
        {children}
      </select>
    </div>
  );
}
