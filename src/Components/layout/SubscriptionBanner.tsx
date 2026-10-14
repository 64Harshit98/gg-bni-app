import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/Firebase';
import { useAuth } from '../../context/auth-context';
import ShinyText from '../ShinyText';

/** Days left on the subscription (moved out of Home.tsx so the layout can own the strip). */
export function useSubscriptionBanner() {
  const { currentUser } = useAuth();
  const [days, setDays] = useState<number | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!currentUser?.companyId) return;
      try {
        const snap = await getDoc(doc(db, 'companies', currentUser.companyId));
        if (!snap.exists()) return;
        const expiry = snap.data().expiryDate;
        if (!expiry) return;
        const d = expiry.toDate ? expiry.toDate() : new Date(expiry);
        setDays(Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
      } catch (e) {
        console.error('Failed to load subscription expiry', e);
      }
    };
    load();
  }, [currentUser?.companyId]);

  return {
    days,
    visible: days !== null && days <= 7 && days >= 0,
    urgent: days !== null && days <= 2,
  };
}

interface Props {
  days: number;
  urgent: boolean;
  /** desktop = joined under the floating top bar · mobile = full width under the mobile header */
  variant: 'desktop' | 'mobile';
}

export function SubscriptionBanner({ days, urgent, variant }: Props) {
  const shell =
    variant === 'desktop'
      ? // same mx-3 as the top bar, no gap, only the bottom corners rounded → one joined block
        'mx-3 hidden shrink-0 rounded-b-sm border border-t-0 border-slate-200/80 md:block'
      : 'w-full shrink-0 md:hidden';

  return (
    <div className={`${shell} px-4 py-2 text-center text-sm font-bold text-white transition-colors duration-300 ${urgent ? 'bg-red-300' : 'bg-amber-200'}`}>
      <ShinyText
        text={`Subscription expires in ${days} ${days === 1 ? 'day' : 'days'}.`}
        speed={4} delay={0} color="#030303" shineColor="#faf5f5" spread={100}
        direction="left" yoyo={false} pauseOnHover={false} disabled={false}
      />
      <Link to="/subscription" className="ml-2 text-black underline hover:text-gray-100">Renew Now</Link>
    </div>
  );
}