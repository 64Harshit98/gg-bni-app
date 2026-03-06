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
    <div className="flex flex-col gap-1 flex-1 sm:flex-row sm:items-center sm:gap-2">
      <label className="text-sm font-medium text-gray-600 text-center sm:text-left sm:whitespace-nowrap sm:flex-shrink-0">
        {label}
      </label>
      <select
        value={value}
        onChange={onChange}
        className="w-full p-2 border border-gray-300 rounded-md bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm "
      >
        {children}
      </select>
    </div>
  );
}
