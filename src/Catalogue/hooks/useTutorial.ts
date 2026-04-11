import { useEffect } from 'react';
import { db } from '../../lib/Firebase';
import { doc, getDoc } from 'firebase/firestore';

const useTutorial = (
  currentUser: any,
  setTutorialStep: (step: number) => void,
  tutorialKey: string
) => {
  useEffect(() => {
    const checkTutorial = async () => {
      if (!currentUser?.companyId) return;

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
  }, [currentUser, setTutorialStep, tutorialKey]);
};

export default useTutorial;