import React, { useEffect, useState } from 'react';

import { Button } from '../../../Components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../Components/ui/dialog';
import { Input } from '../../../Components/ui/input';
import { Label } from '../../../Components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../Components/ui/select';
import { Spinner } from '../../../Components/ui/spinner';
import { ROLES } from '../../../enums';
import type { CompanyUser, CompanyUserUpdate } from '../../../services/settings/catalogueUserSetting.service';

interface EditUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: CompanyUser | null;
  availableRoles: string[];
  saving: boolean;
  onSave: (data: CompanyUserUpdate) => void | Promise<void>;
}

/** Dialog for editing a company user's name, phone number and role. */
export const EditUserDialog: React.FC<EditUserDialogProps> = ({
  open,
  onOpenChange,
  user,
  availableRoles,
  saving,
  onSave,
}) => {
  const [name, setName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [role, setRole] = useState('');

  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setPhoneNumber(user.phoneNumber || '');
      setRole(user.role || '');
    }
  }, [user]);

  if (!user) return null;

  const isOwner = user.role === ROLES.OWNER;

  const handleSave = () => {
    onSave({
      name: name.trim(),
      phoneNumber: phoneNumber.trim(),
      role: (isOwner ? user.role : role)?.trim() || '',
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" showClose={!saving}>
        <DialogHeader>
          <DialogTitle>Edit User</DialogTitle>
          <DialogDescription>Update contact details and role for this user.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="edit-user-name">Name</Label>
            <Input id="edit-user-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-user-phone">Phone Number</Label>
            <Input
              id="edit-user-phone"
              type="tel"
              maxLength={10}
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-user-role">Role</Label>
            {isOwner ? (
              <Input
                id="edit-user-role"
                value={user.role || 'OWNER'}
                readOnly
                className="cursor-not-allowed bg-muted text-muted-foreground"
              />
            ) : (
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger id="edit-user-role" className="w-full">
                  <SelectValue placeholder="Select Role" />
                </SelectTrigger>
                <SelectContent>
                  {availableRoles.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r.charAt(0).toUpperCase() + r.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <p className="text-xs text-muted-foreground">Email: {user.email || 'N/A'} (Not editable)</p>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            className="gap-1.5 bg-gradient-brand text-white hover:opacity-90"
            disabled={saving}
            onClick={handleSave}
          >
            {saving ? <Spinner size="sm" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
