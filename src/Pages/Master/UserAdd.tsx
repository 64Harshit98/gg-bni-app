import React, { useState } from 'react';
import { UserPlus } from 'lucide-react';
import { ROLES } from '../../enums';
import { useAuth } from '../../context/auth-context';
import { createUser } from '../../services/userAdd.service';
import { FloatingLabelInput } from '../../Components/ui/FloatingLabelInput';
import { Button } from '../../Components/ui/button';
import { ReusableDropdown, type Option } from '../../Components/Dropdown';
import BackButton from '../../Components/BackButton';
import { Spinner } from '../../Components/ui/spinner';

const roleOptions: Option<ROLES>[] = [
  { value: ROLES.SALESMAN, label: 'Salesman' },
  { value: ROLES.MANAGER, label: 'Manager' },
  { value: ROLES.OWNER, label: 'Owner' }
];

const UserAdd: React.FC = () => {
  const { currentUser, loading } = useAuth();
  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<ROLES>(ROLES.SALESMAN);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!currentUser?.companyId) {
      setError('Your company information could not be found. Please try logging in again.');
      return;
    }

    if (!fullName.trim() || !email.trim() || !password.trim() || !phoneNumber.trim()) {
      setError('Please fill out all user details.');
      return;
    }

    setIsSubmitting(true);

    try {
      await createUser({
        fullName: fullName.trim(),
        phoneNumber: phoneNumber.trim(),
        email: email.trim(),
        password,
        role,
      });

      setSuccess(`User "${fullName.trim()}" created successfully!`);

      // Reset form
      setFullName('');
      setPhoneNumber('');
      setEmail('');
      setPassword('');

      setTimeout(() => {
        setSuccess(null);
      }, 2000);

    } catch (err) {
      console.error('User creation failed:', err);
      // The error message (e.g., "This email is already registered")
      // will come directly from the Cloud Function.
      setError(err instanceof Error ? err.message : 'An unexpected error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3">
        <Spinner size="xl" className="text-muted-foreground" />
        <p className="text-muted-foreground">Loading user data...</p>
      </div>
    );
  }

  return (
    <div className="aurora flex h-full w-full flex-col overflow-hidden bg-muted">
      <header className="glass mx-3 mt-3 flex flex-shrink-0 items-center gap-3 rounded-2xl p-3 shadow-sm">
        <BackButton />
        <div className="rounded-2xl bg-gradient-to-br from-primary to-[oklch(0.6_0.22_330)] p-[3px] shadow-sm shadow-primary/20">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-[13px] bg-gradient-brand text-white">
            <UserPlus className="size-4" />
          </span>
        </div>
        <div>
          <h1 className="text-lg font-bold tracking-tight text-foreground md:text-xl">
            Add New <span className="text-gradient">User</span>
          </h1>
          <p className="text-xs text-muted-foreground">Invite a new team member to your company</p>
        </div>
      </header>

      <main className="w-full flex-grow overflow-y-auto p-4 sm:p-6">
        <div className="w-full rounded-2xl border border-border bg-card p-6 shadow-xs sm:p-8">
          <form onSubmit={handleAddUser} className="space-y-6">
            <div>
              <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-muted-foreground">
                User Details
              </h2>

              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
                <FloatingLabelInput
                  id="fullName"
                  type="text"
                  label="Full Name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  disabled={isSubmitting}
                />
                <FloatingLabelInput
                  id="phoneNumber"
                  type="tel"
                  label="Phone Number"
                  maxLength={10}
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  required
                  disabled={isSubmitting}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <FloatingLabelInput
                id="email"
                type="email"
                label="Email Address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isSubmitting}
              />

              <FloatingLabelInput
                id="password"
                type="password"
                label="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isSubmitting}
              />

              <div className="w-full">
                <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Role</label>
                <ReusableDropdown
                  options={roleOptions}
                  value={role}
                  onChange={setRole}
                  placeholder="Select a role..."
                  disabled={isSubmitting}
                  className="w-full"
                />
              </div>
            </div>

            {error && (
              <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-4">
                <p className="text-sm font-medium text-destructive">{error}</p>
              </div>
            )}
            {success && (
              <div className="rounded-xl border border-success/20 bg-success/10 p-4">
                <p className="text-sm font-medium text-success">{success}</p>
              </div>
            )}

            <div className="mt-8 border-t border-border pt-4">
              <Button
                type="submit"
                disabled={isSubmitting}
                className="w-full gap-2 bg-gradient-brand text-white shadow-md shadow-primary/20 hover:opacity-90 sm:w-auto sm:px-12"
                size="lg"
              >
                {isSubmitting ? (
                  <>
                    <Spinner size="sm" />
                    Adding User...
                  </>
                ) : (
                  'Add User'
                )}
              </Button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
};

export default UserAdd;
