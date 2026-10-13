import { useEffect, useRef } from 'react';
import { db } from '../../lib/Firebase';
import { doc, getDoc } from 'firebase/firestore';

const useTutorial = (
  currentUser: any,
  setTutorialStep: (step: number) => void,
  tutorialKey: string
) => {
  const hasChecked = useRef(false); // ✅ Prevent re-runs on resize/re-render
  useEffect(() => {
    if (hasChecked.current) return; // ✅ Only run once per mount
    const checkTutorial = async () => {
      if (!currentUser?.companyId) return;
 hasChecked.current = true; // ✅ Mark as checked immediately
      try {
        const ref = doc(
          db,
          'companies',
          currentUser.companyId,
          'settings',
          'tutorial'
        );

        const snap = await getDoc(ref);

       
        const done =
          snap.exists() && snap.data()?.[tutorialKey];

        if (!done) {
          setTutorialStep(1);
        }
      } catch (e) {
        console.error(`Error fetching ${tutorialKey}:`, e);
        setTutorialStep(1);
      }
    };

    checkTutorial();
  }, [currentUser?.companyId, setTutorialStep, tutorialKey]);
};

export default useTutorial;