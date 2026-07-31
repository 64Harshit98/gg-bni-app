import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../Components/ui/table';
import { InfoTooltip } from '../../../Components/InfoToolTip';
import type { Cata_Permissions } from '../../../Catalogue/enum/cata_permissions.enum';
import { CATA_PERMISSION_DESCRIPTIONS } from './cataloguePermissionGroups';

interface CataloguePermissionGroupTableProps {
  title: string;
  permissions: Cata_Permissions[];
  checkedPermissions: Cata_Permissions[];
  onChange: (permission: Cata_Permissions, checked: boolean) => void;
}

/** A titled table listing permissions with an "Enabled" checkbox column for the selected role. */
export function CataloguePermissionGroupTable({
  title,
  permissions,
  checkedPermissions,
  onChange,
}: CataloguePermissionGroupTableProps) {
  if (permissions.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-xs">
      <div className="border-b border-border bg-muted/40 px-4 py-3">
        <h3 className="text-sm font-bold text-foreground">{title}</h3>
      </div>
      <Table containerClassName="rounded-none border-0">
        <TableHeader>
          <TableRow>
            <TableHead>Permission</TableHead>
            <TableHead className="w-24 text-right">Enabled</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {permissions.map((permission) => {
            const checked = checkedPermissions.includes(permission);
            const description = CATA_PERMISSION_DESCRIPTIONS[permission];
            return (
              <TableRow key={permission}>
                <TableCell className="whitespace-normal">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-foreground">{permission}</span>
                    {description ? <InfoTooltip text={description} /> : null}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <label className="inline-flex cursor-pointer items-center justify-end">
                    <input
                      type="checkbox"
                      className="peer h-5 w-5 appearance-none rounded border border-border transition-all checked:border-primary checked:bg-primary hover:shadow-xs"
                      checked={checked}
                      onChange={(e) => onChange(permission, e.target.checked)}
                      aria-label={`Toggle ${permission}`}
                    />
                  </label>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
