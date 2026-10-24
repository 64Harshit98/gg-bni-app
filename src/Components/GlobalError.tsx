import React from 'react';
import { isRouteErrorResponse, useRouteError } from 'react-router-dom';
import CrashScreen from './CrashScreen';

const GlobalError: React.FC = () => {
    const error = useRouteError();

    console.error("Global Error Caught:", error);

    const notFound = isRouteErrorResponse(error) && error.status === 404;

    return <CrashScreen error={error} kind={notFound ? 'notFound' : undefined} />;
};

export default GlobalError;
