import * as React from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../Components/ui/select';

/** Sentinel used internally to represent an empty-string option value in Radix's Select. */
const EMPTY_VALUE_SENTINEL = '__all__';

/**
 * Restyled onto the shared `Select` primitive while keeping the original
 * `<select>`-shaped public API (`children` as `<option>` elements, `onChange`
 * receiving a `ChangeEvent<HTMLSelectElement>`) so existing call sites across
 * the app (Catalogue item/manage-items/P&L reports, Master > Manage Items)
 * keep working unchanged.
 */
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
  const options = React.useMemo(
    () =>
      React.Children.toArray(children).flatMap((child) => {
        if (!React.isValidElement(child)) return [];
        const props = child.props as { value?: string; children?: React.ReactNode };
        return [{ value: props.value ?? '', label: props.children }];
      }),
    [children],
  );

  const selectValue = value === '' ? EMPTY_VALUE_SENTINEL : value;

  const handleValueChange = (next: string) => {
    const resolved = next === EMPTY_VALUE_SENTINEL ? '' : next;
    onChange({ target: { value: resolved } } as React.ChangeEvent<HTMLSelectElement>);
  };

  return (
    <div className="flex flex-col gap-1 flex-1 sm:flex-row sm:items-center sm:gap-2">
      <label className="text-sm font-medium text-muted-foreground text-center sm:text-left sm:whitespace-nowrap sm:flex-shrink-0">
        {label}
      </label>
      <Select value={selectValue} onValueChange={handleValueChange}>
        <SelectTrigger className="w-full bg-muted">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option, index) => (
            <SelectItem
              key={`${option.value || EMPTY_VALUE_SENTINEL}-${index}`}
              value={option.value === '' ? EMPTY_VALUE_SENTINEL : option.value}
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
