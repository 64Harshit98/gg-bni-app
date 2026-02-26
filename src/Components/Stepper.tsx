import React from 'react';

interface StepperProps {
    totalSteps: number;
    currentStep: number;
    onStepClick?: (step: number) => void;

    // --- New Color Props ---
    // Class for the ACTIVE step circle (e.g., "bg-emerald-600 text-white")
    activeClassName?: string;
    // Class for COMPLETED step circles (e.g., "bg-emerald-100 text-emerald-600")
    completedClassName?: string;
    // Class for the line connecting completed steps (e.g., "bg-emerald-600")
    connectorClassName?: string;
}

export const Stepper: React.FC<StepperProps> = ({
    totalSteps,
    currentStep,
    onStepClick,
    // Set Default Defaults to Blue if nothing is passed
    activeClassName = 'bg-blue-600 text-white',
    completedClassName = 'bg-blue-100 text-blue-600',
    connectorClassName = 'bg-blue-600'
}) => {
    return (
        <div className="flex items-center w-full">
            {Array.from({ length: totalSteps }, (_, index) => {
                const stepNumber = index + 1;
                const isActive = stepNumber === currentStep;
                const isCompleted = stepNumber < currentStep;

                // Allow clicking if a handler is provided
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
                                        ? `${activeClassName} scale-110 shadow-md` // Use prop
                                        : isCompleted
                                            ? completedClassName // Use prop
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
                                className={`flex-1 h-1 mx-2 rounded transition-colors duration-300 ${isCompleted ? connectorClassName : 'bg-gray-200'
                                    }`}
                            />
                        )}
                    </React.Fragment>
                );
            })}
        </div>
    );
};