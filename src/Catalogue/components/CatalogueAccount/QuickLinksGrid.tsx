import * as React from 'react';
import { Link } from 'react-router-dom';
import { ROUTES } from '../../../constants/routes.constants';
import { TutorialStep } from '../../../Components/TutorialStep';
import ShowWrapper from '../../../context/ShowWrapper';
import { Cata_Permissions } from '../../enum/cata_permissions.enum';

interface QuickLinksGridProps {
  tutorialStep: number;
  onNext: (n: number) => void;
  onSkip: () => void;
  onComplete: () => void;
  onLogout: () => void;
  reportsRef: React.RefObject<HTMLDivElement | null>;
  settingRef: React.RefObject<HTMLDivElement | null>;
  plansRef: React.RefObject<HTMLDivElement | null>;
  supportRef: React.RefObject<HTMLDivElement | null>;
  addOnsRef: React.RefObject<HTMLDivElement | null>;
}

const linkClass =
  'flex items-center justify-between rounded-xl border border-border bg-card p-4 text-foreground shadow-sm transition-shadow hover:shadow-lg';

export const QuickLinksGrid: React.FC<QuickLinksGridProps> = ({
  tutorialStep,
  onNext,
  onSkip,
  onComplete,
  onLogout,
  reportsRef,
  settingRef,
  plansRef,
  supportRef,
  addOnsRef,
}) => (
  <>
    <div className="mt-2 grid w-full grid-cols-2 justify-center gap-4">
      <ShowWrapper requiredPermission={Cata_Permissions.ViewReports}>
        <div ref={reportsRef}>
          <TutorialStep
            step={3}
            currentStep={tutorialStep}
            text="View detailed sales and business reports here."
            onNext={() => onNext(4)}
            onSkip={onSkip}
            mobileArrowAlign="left"
          >
            <Link to={`${ROUTES.CHOME}/${ROUTES.CATALOGUE_REPORTS}`} className={linkClass}>
              <span className="text-lg font-medium">Reports</span>
              <span className="text-xl text-muted-foreground">→</span>
            </Link>
          </TutorialStep>
        </div>
        <div ref={settingRef}>
          <TutorialStep
            step={4}
            currentStep={tutorialStep}
            text="Configure your business settings, taxes, units and more."
            onNext={() => onNext(5)}
            onSkip={onSkip}
          >
            <Link to={`${ROUTES.CHOME}/${ROUTES.CATA_MASTERS}`} className={linkClass}>
              <span className="text-lg font-medium">Settings</span>
              <span className="text-xl text-muted-foreground">→</span>
            </Link>
          </TutorialStep>
        </div>
      </ShowWrapper>
      <div ref={plansRef}>
        <TutorialStep
          step={5}
          currentStep={tutorialStep}
          text="View and manage your subscription plan here."
          onNext={() => onNext(6)}
          onSkip={onSkip}
          mobileArrowAlign="left"
        >
          <Link to={ROUTES.SUBSCRIPTION_PAGE} className={linkClass}>
            <span className="text-lg font-medium">Plans</span>
            <span className="text-xl text-muted-foreground">→</span>
          </Link>
        </TutorialStep>
      </div>
      <div ref={supportRef}>
        <TutorialStep
          step={6}
          currentStep={tutorialStep}
          text="Need help? Reach out to our support team from here."
          onNext={() => onNext(7)}
          onSkip={onSkip}
        >
          <Link to={`${ROUTES.CHOME}/${ROUTES.CATA_SUPPORT}`} className={linkClass}>
            <span className="text-lg font-medium">Supports</span>
            <span className="text-xl text-muted-foreground">→</span>
          </Link>
        </TutorialStep>
      </div>
    </div>

    <div className="mt-4 flex flex-col items-center gap-4">
      <div ref={addOnsRef}>
        <TutorialStep step={7} currentStep={tutorialStep} text="Unlock extra features for your business with Add Ons." onNext={onComplete} onSkip={onSkip} isLast>
          <Link
            to={`${ROUTES.CHOME}/${ROUTES.CATA_ADDITIONAL_SERVICES}`}
            className="rounded-xl border border-border bg-card px-8 py-3 font-semibold text-foreground shadow-sm hover:shadow-lg"
          >
            Add Ons →
          </Link>
        </TutorialStep>
      </div>
      <button
        onClick={onLogout}
        className="rounded-xl bg-destructive px-8 py-3 font-semibold text-destructive-foreground transition hover:opacity-90"
      >
        Logout
      </button>
    </div>
  </>
);
