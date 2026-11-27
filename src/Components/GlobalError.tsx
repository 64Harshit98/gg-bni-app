import React, { useEffect } from 'react';
import { isRouteErrorResponse, useRouteError } from 'react-router-dom';
import CrashScreen from './CrashScreen';
import { isChunkLoadError, isReloadPending, reloadOnce } from '../lib/chunkReload';

const GlobalError: React.FC = () => {
    const error = useRouteError();

    // A lazy route's chunk failing to load almost always means a deploy
    // replaced the hashed files under an open tab — reload onto the current
    // build straight away. reloadOnce() refuses if it already reloaded moments
    // ago, in which case CrashScreen ends on its manual reload button.
    useEffect(() => {
        if (isChunkLoadError(error) && !isReloadPending()) reloadOnce();
    }, [error]);

    console.error("Global Error Caught:", error);

    const notFound = isRouteErrorResponse(error) && error.status === 404;

    // A reload already under way (e.g. started by the vite:preloadError listener
    // in main.tsx) keeps showing the update screen until it happens.
    return <CrashScreen error={error} kind={notFound ? 'notFound' : isReloadPending() ? 'update' : undefined} />;
};

export default GlobalError;
