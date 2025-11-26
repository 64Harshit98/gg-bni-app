// src/Components/ui/Stepper.tsx
import React from 'react';

interface StepperProps {
    totalSteps: number;
    currentStep: number;
}

/**
 * A simple visual stepper component.
 */
export const Stepper: React.FC<StepperProps> = ({ totalSteps, currentStep }) => {
    return (
        <div className="flex items-center w-full">
            {Array.from({ length: totalSteps }, (_, index) => {
                const stepNumber = index + 1;
                const isActive = stepNumber === currentStep;
                const isCompleted = stepNumber < currentStep;

                return (
                    <React.Fragment key={stepNumber}>
                        <div className="flex flex-col items-center">
                            <div
                                className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${isActive
                                        ? 'bg-blue-600 text-white'
                                        : isCompleted
                                            ? 'bg-blue-100 text-blue-600'
                                            : 'bg-gray-200 text-gray-500'
                                    }`}
                            >
                                {stepNumber}
                            </div>
                        </div>
                        {stepNumber < totalSteps && (
                            <div
                                className={`flex-1 h-1 ${isCompleted ? 'bg-blue-600' : 'bg-gray-200'
                                    }`}
                            />
                        )}
                    </React.Fragment>
                );
            })}
        </div>
    );
};