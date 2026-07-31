import { cn } from '../../../../lib/utils';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../../Components/ui/table';

export interface TaxComplianceRow {
  label: string;
  values: [string, string, string];
  /** Highlights the row as the final "net payable" line. */
  highlight?: boolean;
}

interface TaxComplianceTableProps {
  labelHeader: string;
  columnHeaders: [string, string, string];
  rows: TaxComplianceRow[];
}

/**
 * Fixed 4-column compliance summary table (label + 3 value columns), used by
 * the GSTR-3B and CMP-08 tabs. Values are pre-formatted currency strings
 * (`₹1,234.00`) so this component stays presentation-only.
 */
export function TaxComplianceTable({ labelHeader, columnHeaders, rows }: TaxComplianceTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{labelHeader}</TableHead>
          {columnHeaders.map((h) => (
            <TableHead key={h} className="text-right">
              {h}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.label} className={cn(row.highlight && 'bg-success/8 font-bold')}>
            <TableCell className={cn(row.highlight ? 'font-bold text-foreground' : 'font-medium text-foreground')}>
              {row.label}
            </TableCell>
            {row.values.map((v, i) => (
              <TableCell key={i} className="text-right">
                {v}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
