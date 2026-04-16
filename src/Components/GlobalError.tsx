import React from 'react';
import { useRouteError, useNavigate } from 'react-router-dom';
import { CustomButton } from './CustomButton';
import { Variant } from '../enums';
import dogImage from '../assets/dog-error.png';

const GlobalError: React.FC = () => {
    const error = useRouteError();
    const navigate = useNavigate();


    console.error("Global Error Caught:", error);

    return (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gray-50 p-6 text-center font-poppins overflow-hidden">
            <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full border border-red-100">
                <div className="flex justify-center mx-auto mb-4">

                    <img
                        src={dogImage} // Replace with your actual image path
                        alt="Sad Dog"
                        className="w-60 h-24 object-contain"
                    />
                </div>

                <h2 className="text-2xl font-bold text-gray-800 mb-2">Oops!</h2>
                <p className="text-gray-500 mb-6 text-sm flex flex-col items-center gap-2">
                    <span>I crashed !!</span>
                </p>
                <div className="space-y-3">
                    <CustomButton
                        variant={Variant.Filled}
                        onClick={() => window.location.reload()}
                        className="w-full justify-center"
                    >
                        Reload Page
                    </CustomButton>

                    <button
                        onClick={() => navigate('/')}
                        className="text-sm text-gray-500 hover:text-gray-800 underline block w-full mt-2"
                    >
                        Go to Home
                    </button>
                </div>
            </div>
        </div>
    );
};

export default GlobalError;