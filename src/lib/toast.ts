/**
 * App-wide toast API. Import from here (not 'sonner' directly) so we can
 * swap or wrap the implementation in one place.
 *
 *   import { toast } from '@/lib/toast';
 *   toast.success('Saved');
 *   toast.error('Something went wrong');
 */
export { toast } from 'sonner';
export type { ExternalToast } from 'sonner';
