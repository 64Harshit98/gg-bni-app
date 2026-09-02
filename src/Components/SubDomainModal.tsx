import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/Firebase';
import { Loader2, CheckCircle, AlertCircle, X, Copy, Check } from 'lucide-react';

interface SubdomainClaimModalProps {
    companyId: string;
    forceOpen?: boolean;
    onClose?: () => void;
}

export default function SubdomainClaimModal({ companyId, forceOpen, onClose }: SubdomainClaimModalProps) {
    const [isVisible, setIsVisible] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [copied, setCopied] = useState(false);

    const [prefix, setPrefix] = useState('');
    const [suffix, setSuffix] = useState('shop'); // 'shop' or 'catalog'
    const [subdomain, setSubdomain] = useState('');

    const [existingSubdomain, setExistingSubdomain] = useState<string | null>(null);
    const [isChecking, setIsChecking] = useState(false);
    const [availability, setAvailability] = useState<'idle' | 'available' | 'taken'>('idle');
    const [isSaving, setIsSaving] = useState(false);

    // 1. Fetch Existing Data on Load
    useEffect(() => {
        const checkExistingSubdomain = async () => {
            if (!companyId) return;
            try {
                const docRef = doc(db, 'companies', companyId);
                const docSnap = await getDoc(docRef);

                if (docSnap.exists()) {
                    const data = docSnap.data();
                    if (data.subdomain) {
                        setExistingSubdomain(data.subdomain);

                        // Pre-fill the inputs if a domain already exists
                        if (data.subdomain.endsWith('-catalog')) {
                            setSuffix('catalog');
                            setPrefix(data.subdomain.replace('-catalog', ''));
                        } else if (data.subdomain.endsWith('-shop')) {
                            setSuffix('shop');
                            setPrefix(data.subdomain.replace('-shop', ''));
                        } else {
                            setPrefix(data.subdomain);
                        }
                    }

                    if (forceOpen || (!data.subdomain && !sessionStorage.getItem('subdomainDismissed'))) {
                        setIsVisible(true);
                    }
                }
            } catch (error) {
                console.error("Error fetching subdomain:", error);
            } finally {
                setIsLoading(false);
            }
        };

        checkExistingSubdomain();
    }, [companyId, forceOpen]);

    // 2. Combine Prefix and Suffix dynamically
    useEffect(() => {
        if (!prefix) {
            setSubdomain('');
            setAvailability('idle');
            return;
        }

        // Format strictly: lowercase, no special characters, no trailing hyphens
        const formattedPrefix = prefix.toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/-$/, '');
        const combined = `${formattedPrefix}-${suffix}`;

        setSubdomain(combined);

        // Immediate Success: It's their existing domain!
        if (combined === existingSubdomain) {
            setAvailability('available');
        } else {
            setAvailability('idle');
        }
    }, [prefix, suffix, existingSubdomain]);

    // 3. Check Database for Custom Entries
    useEffect(() => {
        const checkAvailability = async () => {
            if (!subdomain || subdomain.length < 3 || subdomain === existingSubdomain) return;

            setIsChecking(true);
            try {
                const companiesRef = collection(db, 'companies');
                const q = query(companiesRef, where('domainAliases', 'array-contains', subdomain));
                const querySnapshot = await getDocs(q);

                if (querySnapshot.empty) {
                    setAvailability('available');
                } else {
                    setAvailability('taken');
                }
            } catch (error) {
                console.error("Error checking subdomain:", error);
            } finally {
                setIsChecking(false);
            }
        };

        const timeoutId = setTimeout(() => {
            if (subdomain.length >= 3 && subdomain !== existingSubdomain) {
                checkAvailability();
            }
        }, 600);

        return () => clearTimeout(timeoutId);
    }, [subdomain, existingSubdomain]);

    // 4. Save and Update Document
    // 4. Save and Update Document
    const handleClaimSubdomain = async () => {
        if (availability !== 'available' || !companyId) return;

        setIsSaving(true);
        try {
            const companyDocRef = doc(db, 'companies', companyId);

            // 1. Fetch the current document to get the existing aliases
            const docSnap = await getDoc(companyDocRef);
            let updatedAliases = [subdomain];

            if (docSnap.exists()) {
                const data = docSnap.data();
                const currentAliases = data.domainAliases || [];

                // 2. Filter out the old subdomain so it is released for others
                updatedAliases = currentAliases.filter((alias: string) => alias !== existingSubdomain);

                // 3. Ensure the newly claimed subdomain is in the array
                if (!updatedAliases.includes(subdomain)) {
                    updatedAliases.push(subdomain);
                }
            }

            // 4. Update the database with the cleaned array
            await updateDoc(companyDocRef, {
                subdomain: subdomain,
                domainAliases: updatedAliases
            });

            closeModal();
        } catch (error) {
            console.error("Error saving subdomain:", error);
            alert("Failed to update link. Please try again.");
        } finally {
            setIsSaving(false);
        }
    };
    const closeModal = () => {
        sessionStorage.setItem('subdomainDismissed', 'true');
        setIsVisible(false);
        if (onClose) onClose();
    };

    if (isLoading || !isVisible) return null;

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white rounded-sm shadow-2xl max-w-md w-full p-6 md:p-8 animate-in zoom-in duration-300 relative">

                <button onClick={closeModal} className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 transition-colors p-1">
                    <X size={20} />
                </button>

                <div className="text-center mb-6 mt-2">
                    <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <span className="text-2xl">🔗</span>
                    </div>
                    <h2 className="text-2xl font-black text-[#1A3B5D] uppercase tracking-tight">
                        {existingSubdomain ? 'Update Store Link' : 'Claim Store Link'}
                    </h2>
                    <p className="text-sm text-gray-500 mt-2">
                        This is the unique URL you will share with your customers.
                    </p>
                    {existingSubdomain && (
                        <div className="flex items-center justify-between bg-gray-100 border border-gray-200 rounded-sm px-3 py-2 mb-4">
                            <span className="text-xs font-bold text-gray-600 truncate">
                                https://{existingSubdomain}.sellar.in
                            </span>
                            <button
                                onClick={() => {
                                    navigator.clipboard.writeText(`https://${existingSubdomain}.sellar.in`);
                                    setCopied(true);
                                    setTimeout(() => setCopied(false), 2000);
                                }}
                                className="ml-2 p-1 text-gray-500 hover:text-gray-800"
                            >
                                {copied ? (
                                    <Check size={16} className="text-green-600" />
                                ) : (
                                    <Copy size={16} />
                                )}
                            </button>
                        </div>
                    )}
                </div>

                <div className="mb-6">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block ml-1">
                        Choose a Name
                    </label>

                    {/* Split Input UI */}
                    <div className="flex items-center justify-between w-full gap-1.5 sm:gap-2 mb-2">

                        {/* 1. Prefix Input */}
                        <input
                            type="text"
                            value={prefix}
                            onChange={(e) => setPrefix(e.target.value)}
                            placeholder="my-brand"
                            // min-w-0 is the critical fix here!
                            className="flex-1 min-w-0 p-2.5 sm:p-3 bg-white border border-gray-200 rounded-sm text-[13px] sm:text-sm font-bold text-[#1A3B5D] outline-none focus:border-[#F97316] focus:ring-1 focus:ring-[#F97316] transition-all text-right shadow-sm"
                            autoFocus
                        />

                        {/* 2. The Separator */}
                        <span className="text-gray-400 font-bold text-base sm:text-lg select-none shrink-0">
                            -
                        </span>

                        {/* 3. Suffix Dropdown */}
                        <div className="relative shrink-0">
                            <select
                                value={suffix}
                                onChange={(e) => setSuffix(e.target.value)}
                                className="appearance-none w-full bg-white border border-gray-200 rounded-sm py-2.5 sm:py-3 pl-2 sm:pl-3 pr-7 sm:pr-8 text-[13px] sm:text-sm font-bold text-[#1A3B5D] outline-none focus:border-[#F97316] focus:ring-1 focus:ring-[#F97316] transition-all cursor-pointer shadow-sm"
                            >
                                <option value="shop">shop</option>
                                <option value="catalog">catalog</option>
                            </select>
                            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-1.5 sm:px-2 text-gray-400">
                                <svg className="fill-current h-3 w-3 sm:h-4 sm:w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                                    <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                                </svg>
                            </div>
                        </div>

                        {/* 4. Base Domain */}
                        <div className="bg-gray-100 px-2 sm:px-3 py-2.5 sm:py-3 border border-gray-200 rounded-sm text-gray-500 font-bold text-[13px] sm:text-sm select-none shadow-sm shrink-0">
                            .sellar.in
                        </div>

                    </div>

                    <div className="h-6 mt-2 flex items-center justify-center text-xs font-bold">
                        {subdomain.length > 0 && subdomain.length < 3 && (
                            <span className="text-orange-500 flex items-center gap-1"><AlertCircle size={14} /> Name is too short</span>
                        )}
                        {isChecking && (
                            <span className="text-blue-500 flex items-center gap-1"><Loader2 size={14} className="animate-spin" /> Checking availability...</span>
                        )}
                        {!isChecking && availability === 'available' && subdomain === existingSubdomain && (
                            <span className="text-gray-500 flex items-center gap-1">This is your current link</span>
                        )}
                        {!isChecking && availability === 'available' && subdomain !== existingSubdomain && (
                            <span className="text-green-600 flex items-center gap-1"><CheckCircle size={14} /> Available to claim!</span>
                        )}
                        {!isChecking && availability === 'taken' && (
                            <span className="text-red-500 flex items-center gap-1"><AlertCircle size={14} /> Already taken</span>
                        )}
                    </div>
                </div>

                <button
                    onClick={handleClaimSubdomain}
                    disabled={availability !== 'available' || isSaving || subdomain === existingSubdomain}
                    className={`w-full py-3.5 rounded-sm font-black text-[12px] uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${availability === 'available' && !isSaving && subdomain !== existingSubdomain
                        ? 'bg-[#F97316] text-white shadow-lg active:scale-95'
                        : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                        }`}
                >
                    {isSaving ? <Loader2 size={16} className="animate-spin" /> : null}
                    {isSaving ? 'Updating...' : (existingSubdomain ? 'Update Link' : 'Save Link')}
                </button>
            </div>
        </div>
    );
}