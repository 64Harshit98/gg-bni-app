import React, { useEffect, useState } from 'react';
import { db } from '../../lib/Firebase';
// collectionGroup is the secret to finding phantom companies
import { collection, getDocs, doc, setDoc, Timestamp, collectionGroup } from 'firebase/firestore';
import { PLANS } from '../../enums';
import Loading from '../Loading/Loading';
import { useAuth } from '../../context/auth-context';

// --- CONFIGURATION ---
const SUPER_ADMIN_UID = "1AKioGfop8PmHhry6uXOz8Rw6qT2";
const DEFAULT_DURATION_DAYS = 28; 

// --- HELPER ---
const addDays = (date: Date, days: number) => {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
};

interface CompanyData {
    id: string;
    name: string;
    ownerName?: string;
    pack: string;
    validity: 'active' | 'inactive';
    expiryDate?: any; // Timestamp or null
}

const SuperAdminCompanies: React.FC = () => {
    const { currentUser } = useAuth();
    const [companies, setCompanies] = useState<CompanyData[]>([]);
    const [loading, setLoading] = useState(true);

    // Editing State
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState({
        pack: 'free',
        validity: 'active',
        expiryDate: '' // YYYY-MM-DD string
    });

    // 1. Security Check
    if (currentUser?.uid !== SUPER_ADMIN_UID) {
        return <div className="p-10 text-center text-red-500 font-bold text-xl">⛔ ACCESS DENIED</div>;
    }

    // 2. Fetch All Companies (Phantom + Real)
    useEffect(() => {
        const fetchCompanies = async () => {
            try {
                // A. TRICK: Search for ALL users to find hidden phantom companies
                const usersQuery = await getDocs(collectionGroup(db, 'users'));
                const companyMap = new Map<string, CompanyData>();

                // B. Loop users -> Extract Company ID
                usersQuery.forEach((userDoc) => {
                    const parentCompany = userDoc.ref.parent.parent;

                    if (parentCompany && !companyMap.has(parentCompany.id)) {
                        // Found a company! Set defaults in case it's phantom.
                        companyMap.set(parentCompany.id, {
                            id: parentCompany.id,
                            name: 'Unknown (Phantom)',
                            ownerName: 'Unknown',
                            pack: 'free',
                            validity: 'inactive',
                            expiryDate: null
                        });
                    }
                });

                // C. Fetch REAL data (for non-italic companies) and merge it
                const realCompaniesSnap = await getDocs(collection(db, 'companies'));
                realCompaniesSnap.forEach(doc => {
                    const data = doc.data();
                    companyMap.set(doc.id, {
                        id: doc.id,
                        name: data.name || 'Unknown Company',
                        ownerName: data.ownerName || 'Unknown',
                        pack: data.pack || 'free',
                        validity: data.validity || 'inactive',
                        expiryDate: data.expiryDate
                    });
                });

                setCompanies(Array.from(companyMap.values()));

            } catch (error) {
                console.error("Error fetching companies:", error);
                alert("Error fetching data. Check Console.");
            } finally {
                setLoading(false);
            }
        };

        fetchCompanies();
    }, []);

    // 3. Start Editing
    const startEdit = (company: CompanyData) => {
        setEditingId(company.id);

        let dateStr = '';
        if (company.expiryDate) {
            const date = company.expiryDate.toDate ? company.expiryDate.toDate() : new Date(company.expiryDate);
            if (!isNaN(date.getTime())) {
                dateStr = date.toISOString().split('T')[0];
            }
        }

        setEditForm({
            pack: company.pack,
            validity: company.validity as 'active' | 'inactive',
            expiryDate: dateStr
        });
    };

    // 4. Save Changes (Fixed Crash Issue)
    const handleSave = async () => {
        if (!editingId) return;

        try {
            const companyRef = doc(db, "companies", editingId);

            let finalExpiryDate: Date;

            // SMART DURATION LOGIC
            if (editForm.expiryDate) {
                // User entered a date -> Use it
                finalExpiryDate = new Date(editForm.expiryDate);
            } else {
                // User left it EMPTY -> Default to 28 days from now
                finalExpiryDate = addDays(new Date(), DEFAULT_DURATION_DAYS);
            }

            // Always set to end of the day
            finalExpiryDate.setHours(23, 59, 59);

            // [FIX] Prepare payload to avoid sending 'undefined'
            const payload: any = {
                pack: editForm.pack,
                validity: editForm.validity,
                expiryDate: Timestamp.fromDate(finalExpiryDate),
            };

            // Only overwrite name if it is currently 'Unknown (Phantom)'
            const currentCompany = companies.find(c => c.id === editingId);
            if (currentCompany?.name === 'Unknown (Phantom)') {
                payload.name = `Company ${editingId}`;
            }

            // Save to Firebase
            await setDoc(companyRef, payload, { merge: true });

            // Update UI State
            setCompanies(prev => prev.map(c =>
                c.id === editingId
                    ? {
                        ...c,
                        ...payload,
                        // Ensure UI updates the name if we changed it, else keep existing
                        name: payload.name || c.name 
                    }
                    : c
            ));

            setEditingId(null);
            alert(`Saved! Valid until: ${finalExpiryDate.toLocaleDateString()}`);
        } catch (error) {
            console.error("Error updating:", error);
            alert("Failed to update.");
        }
    };

    if (loading) return <Loading />;

    return (
        <div className="p-6 bg-gray-50 min-h-screen">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold text-gray-800">Super Admin: Subscriptions</h1>
                <span className="text-xs text-gray-400">UID: {SUPER_ADMIN_UID.slice(0, 8)}...</span>
            </div>

            <div className="overflow-x-auto bg-white shadow-md rounded-lg">
                <table className="min-w-full leading-normal">
                    <thead>
                        <tr>
                            <th className="px-5 py-3 border-b-2 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase">Company</th>
                            <th className="px-5 py-3 border-b-2 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase">Pack</th>
                            <th className="px-5 py-3 border-b-2 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase">Status</th>
                            <th className="px-5 py-3 border-b-2 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase">Expires On</th>
                            <th className="px-5 py-3 border-b-2 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {companies.map((company) => (
                            <tr key={company.id}>
                                <td className="px-5 py-5 border-b border-gray-200 bg-white text-sm">
                                    <p className={`whitespace-no-wrap font-bold ${company.name === 'Unknown (Phantom)' ? 'text-red-500 italic' : 'text-gray-900'}`}>
                                        {company.name}
                                    </p>
                                    <p className="text-gray-500 text-xs font-mono">{company.id}</p>
                                </td>

                                {editingId === company.id ? (
                                    /* --- EDIT MODE --- */
                                    <>
                                        <td className="px-5 py-5 border-b bg-blue-50">
                                            <select
                                                className="bg-white border p-1 rounded w-full"
                                                value={editForm.pack}
                                                onChange={e => setEditForm({ ...editForm, pack: e.target.value })}
                                            >
                                                {Object.values(PLANS).map(p => <option key={p} value={p}>{p.toUpperCase()}</option>)}
                                            </select>
                                        </td>
                                        <td className="px-5 py-5 border-b bg-blue-50">
                                            <select
                                                className="bg-white border p-1 rounded w-full"
                                                value={editForm.validity}
                                                onChange={e => setEditForm({ ...editForm, validity: e.target.value as any })}
                                            >
                                                <option value="active">Active</option>
                                                <option value="inactive">Inactive</option>
                                            </select>
                                        </td>
                                        <td className="px-5 py-5 border-b bg-blue-50">
                                            <input
                                                type="date"
                                                className="border p-1 rounded w-full"
                                                value={editForm.expiryDate}
                                                onChange={e => setEditForm({ ...editForm, expiryDate: e.target.value })}
                                            />
                                            <div className="text-[10px] text-gray-500 mt-1 leading-tight">
                                                {editForm.expiryDate ? "Custom Date" : "Empty = +28 days"}
                                            </div>
                                        </td>
                                        <td className="px-5 py-5 border-b bg-blue-50">
                                            <button onClick={handleSave} className="bg-green-500 text-white px-3 py-1 rounded text-xs font-bold mr-2 hover:bg-green-600">
                                                Save
                                            </button>
                                            <button onClick={() => setEditingId(null)} className="text-gray-500 text-xs hover:text-gray-700 underline">
                                                Cancel
                                            </button>
                                        </td>
                                    </>
                                ) : (
                                    /* --- VIEW MODE --- */
                                    <>
                                        <td className="px-5 py-5 border-b bg-white text-sm">
                                            <span className={`px-2 py-1 rounded-full text-xs font-bold text-white ${company.pack === 'platinum' ? 'bg-purple-500' :
                                                company.pack === 'gold' ? 'bg-yellow-500' :
                                                    company.pack === 'basic' ? 'bg-blue-500' : 'bg-gray-400'
                                                }`}>
                                                {company.pack.toUpperCase()}
                                            </span>
                                        </td>
                                        <td className="px-5 py-5 border-b bg-white text-sm">
                                            <span className={`px-2 py-1 rounded-full text-xs font-bold ${company.validity === 'active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                                }`}>
                                                {company.validity.toUpperCase()}
                                            </span>
                                        </td>
                                        <td className="px-5 py-5 border-b bg-white text-sm">
                                            {company.expiryDate
                                                ? new Date(company.expiryDate.toDate ? company.expiryDate.toDate() : company.expiryDate).toLocaleDateString()
                                                : <span className="text-gray-400 italic">No Expiry</span>
                                            }
                                        </td>
                                        <td className="px-5 py-5 border-b bg-white text-sm">
                                            <button
                                                onClick={() => startEdit(company)}
                                                className="text-blue-600 hover:text-blue-900 font-medium"
                                            >
                                                Edit
                                            </button>
                                        </td>
                                    </>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default SuperAdminCompanies;