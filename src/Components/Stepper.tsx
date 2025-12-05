// src/Components/Stepper.tsx
import React from 'react';

interface StepperProps {
    totalSteps: number;
    currentStep: number;
    // Added optional prop to handle clicks
    onStepClick?: (step: number) => void; 
}

/**
 * A simple visual stepper component.
 */
export const Stepper: React.FC<StepperProps> = ({ totalSteps, currentStep, onStepClick }) => {
    return (
        <div className="flex items-center w-full">
            {Array.from({ length: totalSteps }, (_, index) => {
                const stepNumber = index + 1;
                const isActive = stepNumber === currentStep;
                const isCompleted = stepNumber < currentStep;
                
                // Determine if this step interacts
                // We generally allow clicking if a handler is passed
                const isClickable = !!onStepClick;

                return (
                    <React.Fragment key={stepNumber}>
                        <div 
                            className="flex flex-col items-center"
                            onClick={() => {
                                if (isClickable && onStepClick) {
                                    onStepClick(stepNumber);
                                }
                            }}
                        >
                            <div
                                className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-all duration-200
                                    ${isActive
                                        ? 'bg-blue-600 text-white scale-110' // Slight pop for active
                                        : isCompleted
                                            ? 'bg-blue-100 text-blue-600'
                                            : 'bg-gray-200 text-gray-500'
                                    }
                                    ${isClickable ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}
                                `}
                            >
                                {stepNumber}
                            </div>
                        </div>
                        
                        {/* Connector Line */}
                        {stepNumber < totalSteps && (
                            <div
                                className={`flex-1 h-1 mx-1 rounded ${isCompleted ? 'bg-blue-600' : 'bg-gray-200'
                                    }`}
                            />
                        )}
                    </React.Fragment>
                );
            })}
        </div>
    );
};