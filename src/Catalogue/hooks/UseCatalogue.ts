import { useState, useEffect } from 'react';

export const useCatalogue = () => {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchStore = async () => {
            try {
                // We hit a relative path because Firebase Hosting routes the request
                const response = await fetch('/api/getPublicCatalogue');

                if (!response.ok) throw new Error("Store data not available");

                const json = await response.json();
                setData(json);
            } catch (err: any) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchStore();
    }, []);

    return { data, loading, error };
};