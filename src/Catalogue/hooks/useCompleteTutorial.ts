import { db } from '../../lib/Firebase';
import { doc, setDoc } from 'firebase/firestore';

export const completeTutorial = async (
  currentUser: any,
  tutorialKey: string,
  setTutorialStep: (step: number) => void
) => {
  if (!currentUser?.companyId) return;

  try {
    await setDoc(
      doc(db, 'companies', currentUser.companyId, 'settings', 'tutorial'),
      { [tutorialKey]: true }, 
      { merge: true }
    );
  } catch (e) {
    console.error(`Error saving ${tutorialKey}:`, e);
  }

  setTutorialStep(0);

  
  window.dispatchEvent(new Event(`${tutorialKey}_done`));
};