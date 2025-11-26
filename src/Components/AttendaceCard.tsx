import React, { useState, useEffect } from 'react';
import { doc, onSnapshot, runTransaction } from 'firebase/firestore';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { db, auth } from '../lib/Firebase';
// Import your main app's auth context
import { useAuth as useFullAuth } from '../context/auth-context';

// --- Authentication Hook (Original) ---
// This is a standalone hook. We'll use your main app's context instead,
// but this hook is fine if used elsewhere.
export const useAuth = () => {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            setUser(currentUser);
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    return { user, loading };
};

// --- Helper Functions (Unchanged) ---
const formatTime = (date: Date | null): string => {
    if (!date) return '---';
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
};

const formatElapsedTime = (totalSeconds: number): string => {
    const hours = Math.floor(totalSeconds / 3600).toString().padStart(2, '0');
    const minutes = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
    const seconds = Math.floor(totalSeconds % 60).toString().padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
};

// --- Data Types and Interfaces (Unchanged) ---
interface LogEntry {
    checkIn: Date;
    checkOut: Date | null;
}

interface AttendanceDoc {
    userId: string;
    date: string;
    status: 'Checked In' | 'Checked Out';
    lastCheckInTime: number | null;
    totalElapsedTime: number;
    log: {
        checkIn: number;
        checkOut: number | null;
    }[];
}

interface UseAttendanceReturn {
    status: 'Checked In' | 'Checked Out';
    checkInTime: Date | null;
    checkOutTime: Date | null;
    elapsedTime: number;
    log: LogEntry[];
    loading: boolean;
    handleCheckIn: () => Promise<void>;
    handleCheckOut: () => Promise<void>;
}

// --- Core Attendance Logic Hook ---
// Pass in both userId and companyId
export const useAttendance = (userId?: string, companyId?: string): UseAttendanceReturn => {
    const [loading, setLoading] = useState(true);
    const [status, setStatus] = useState<'Checked In' | 'Checked Out'>('Checked Out');
    const [checkInTime, setCheckInTime] = useState<Date | null>(null);
    const [checkOutTime, setCheckOutTime] = useState<Date | null>(null);
    const [elapsedTime, setElapsedTime] = useState<number>(0);
    const [log, setLog] = useState<LogEntry[]>([]);
    const [baseElapsedTime, setBaseElapsedTime] = useState<number>(0);
    const [lastCheckInTime, setLastCheckInTime] = useState<Date | null>(null);

    useEffect(() => {
        // Wait for both userId AND companyId
        if (!userId || !companyId) {
            setLoading(false);
            return;
        }

        setLoading(true);
        const today = new Date().toISOString().split('T')[0];
        const documentId = `${userId}_${today}`;

        // --- FIX: Use the correct multi-tenant path ---
        const docRef = doc(db, 'companies', companyId, 'attendance', documentId);

        const unsubscribe = onSnapshot(docRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data() as AttendanceDoc;
                setStatus(data.status || 'Checked Out');

                const currentLog = (data.log || [])
                    .map(l => ({
                        checkIn: new Date(l.checkIn),
                        checkOut: l.checkOut ? new Date(l.checkOut) : null,
                    }))
                    .filter(l => !isNaN(l.checkIn.getTime()));
                setLog(currentLog);

                const lastLogEntry = currentLog.length > 0 ? currentLog[currentLog.length - 1] : null;
                setCheckInTime(lastLogEntry?.checkIn || null);
                setCheckOutTime(lastLogEntry?.checkOut || null);

                setBaseElapsedTime(data.totalElapsedTime || 0);
                setLastCheckInTime(data.status === 'Checked In' && data.lastCheckInTime ? new Date(data.lastCheckInTime) : null);
            } else {
                // No document yet, set to default state
                setStatus('Checked Out'); setCheckInTime(null); setCheckOutTime(null);
                setBaseElapsedTime(0); setLastCheckInTime(null); setLog([]);
            }
            setLoading(false);
        }, (error) => {
            console.error('Attendance snapshot error:', error); setLoading(false);
        });

        return () => unsubscribe();
    }, [userId, companyId]); // Add companyId to dependency array

    // Timer effect (unchanged)
    useEffect(() => {
        let intervalId: NodeJS.Timeout;
        if (status === 'Checked In' && lastCheckInTime) {
            const updateElapsedTime = () => {
                const sessionSeconds = Math.floor((Date.now() - lastCheckInTime.getTime()) / 1000);
                setElapsedTime(baseElapsedTime + sessionSeconds);
            };
            intervalId = setInterval(updateElapsedTime, 1000);
        } else {
            setElapsedTime(baseElapsedTime);
        }
        return () => clearInterval(intervalId);
    }, [status, baseElapsedTime, lastCheckInTime]);

    const handleCheckIn = async () => {
        if (!userId || !companyId) return;

        setLoading(true);
        const today = new Date().toISOString().split('T')[0];

        // --- FIX: Use the correct multi-tenant path ---
        const docRef = doc(db, 'companies', companyId, 'attendance', `${userId}_${today}`);

        try {
            await runTransaction(db, async (transaction) => {
                const docSnap = await transaction.get(docRef);
                const checkInTimestamp = Date.now();
                const newLogEntry = {
                    checkIn: checkInTimestamp,
                    checkOut: null
                };

                if (!docSnap.exists()) {
                    transaction.set(docRef, {
                        userId,
                        date: today,
                        status: 'Checked In',
                        lastCheckInTime: checkInTimestamp,
                        totalElapsedTime: 0,
                        log: [newLogEntry],
                        companyId: companyId, // Store companyId for good practice
                    });
                } else {
                    const data = docSnap.data() as AttendanceDoc;
                    const existingLog = Array.isArray(data.log) ? data.log : [];
                    const updatedLog = [...existingLog, newLogEntry];

                    transaction.update(docRef, {
                        status: 'Checked In',
                        lastCheckInTime: checkInTimestamp,
                        log: updatedLog,
                    });
                }
            });
        } catch (error) {
            console.error('FIREBASE TRANSACTION ERROR (Check-in):', error);
            alert('Failed to check in. Check console for details.');
        } finally {
            setLoading(false);
        }
    };

    const handleCheckOut = async () => {
        if (!userId || !companyId) return;

        setLoading(true);
        const today = new Date().toISOString().split('T')[0];

        // --- FIX: Use the correct multi-tenant path ---
        const docRef = doc(db, 'companies', companyId, 'attendance', `${userId}_${today}`);

        try {
            await runTransaction(db, async (transaction) => {
                const docSnap = await transaction.get(docRef);
                if (!docSnap.exists() || docSnap.data().status !== 'Checked In') {
                    throw new Error("User is not checked in or document doesn't exist.");
                }

                const data = docSnap.data() as AttendanceDoc;
                const lastCheckInTimestamp = data.lastCheckInTime;
                if (!lastCheckInTimestamp) {
                    throw new Error("Cannot check out: lastCheckInTime is missing.");
                }

                const updatedLog = Array.isArray(data.log) ? [...data.log] : [];
                const openLogIndex = updatedLog.findIndex(entry => entry.checkOut === null);
                const checkOutTimestamp = Date.now();

                if (openLogIndex !== -1) {
                    updatedLog[openLogIndex] = {
                        ...updatedLog[openLogIndex],
                        checkOut: checkOutTimestamp,
                    };
                }

                const sessionSeconds = Math.floor((checkOutTimestamp - lastCheckInTimestamp) / 1000);
                const currentTotal = data.totalElapsedTime || 0;
                const newTotalElapsedTime = currentTotal + (sessionSeconds > 0 ? sessionSeconds : 0);

                transaction.update(docRef, {
                    status: 'Checked Out',
                    totalElapsedTime: newTotalElapsedTime,
                    log: updatedLog,
                    lastCheckInTime: null,
                });
            });
        } catch (error) {
            console.error('FIREBASE TRANSACTION ERROR (Check-out):', error);
            alert('Failed to check out. Check console for details.');
        } finally {
            setLoading(false);
        }
    };

    return { status, checkInTime, checkOutTime, elapsedTime, log, loading, handleCheckIn, handleCheckOut };
};

// --- UI Components (Unchanged) ---
const AttendanceCard: React.FC<any> = ({ userName, status, checkInTime, checkOutTime, elapsedTime, onCheckIn, onCheckOut, loading }) => {
    const isCheckedIn = status === 'Checked In';
    return (
        <div className="bg-white rounded-2xl shadow-md p-6 flex flex-col transition-all hover:shadow-lg w-full max-w-sm">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-slate-800">{userName}</h2>
                <span className={`px-3 py-1 text-xs font-semibold rounded-full ${isCheckedIn ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-600'}`}>
                    {loading ? '...' : status}
                </span>
            </div>
            <div className="flex-grow space-y-3 mb-6">
                <div className="flex justify-between items-center bg-slate-50 p-3 rounded-lg">
                    <span className="text-sm font-medium text-slate-500">Checked In At:</span>
                    <span className="text-sm font-semibold text-slate-800">{formatTime(checkInTime)}</span>
                </div>
                <div className="flex justify-between items-center bg-blue-50 p-3 rounded-lg border border-blue-200">
                    <span className="text-sm font-medium text-blue-600">Duration:</span>
                    <span className="text-sm font-semibold text-blue-800 tabular-nums">{formatElapsedTime(elapsedTime)}</span>
                </div>
                <div className="flex justify-between items-center bg-slate-50 p-3 rounded-lg">
                    <span className="text-sm font-medium text-slate-500">Checked Out At:</span>
                    <span className="text-sm font-semibold text-slate-800">{formatTime(checkOutTime)}</span>
                </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
                <button onClick={onCheckIn} disabled={isCheckedIn || loading} className="w-full py-2 px-4 bg-blue-600 text-white font-semibold rounded-lg shadow-sm transition-colors hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed">
                    Check In
                </button>
                <button onClick={onCheckOut} disabled={!isCheckedIn || loading} className="w-full py-2 px-4 bg-slate-600 text-white font-semibold rounded-lg shadow-sm transition-colors hover:bg-slate-700 disabled:bg-slate-300 disabled:cursor-not-allowed">
                    Check Out
                </button>
            </div>
        </div>
    );
};

const AttendanceLogCard: React.FC<{ log: LogEntry[] }> = ({ log }) => {
    return (
        <div className="bg-white rounded-2xl shadow-md p-6 w-full max-w-sm">
            <h3 className="text-lg font-bold text-slate-800 mb-4 border-b pb-2">Activity Log</h3>
            <div className="max-h-48 overflow-y-auto">
                {log.length === 0 ? (
                    <p className="text-sm text-slate-500 text-center py-4">No activity recorded yet.</p>
                ) : (
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-slate-500 uppercase">
                            <tr><th className="py-2 px-2">Check In</th><th className="py-2 px-2">Check Out</th></tr>
                        </thead>
                        <tbody>
                            {[...log].reverse().map((entry, index) => (
                                <tr key={index} className="border-b last:border-0">
                                    <td className="py-2 px-2 font-medium text-slate-700">{formatTime(entry.checkIn)}</td>
                                    <td className="py-2 px-2 font-medium text-slate-700">{formatTime(entry.checkOut)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};

// --- Main Page Component ---
export const AttendancePage: React.FC = () => {
    // --- FIX: Use your main app's AuthContext ---
    const { currentUser, loading: authLoading } = useFullAuth();

    // --- FIX: Pass the currentUser's uid AND companyId to the hook ---
    const { status, checkInTime, checkOutTime, elapsedTime, log, loading: attendanceLoading, handleCheckIn, handleCheckOut } = useAttendance(currentUser?.uid, currentUser?.companyId);

    if (authLoading) {
        return <div className="flex justify-center items-center h-screen">Loading Authentication...</div>;
    }

    if (!currentUser) {
        return (
            <div className="flex justify-center items-center h-screen">
                <p className="text-xl text-slate-600">Please log in to track your attendance.</p>
            </div>
        );
    }

    return (
        <div className="w-full flex flex-col md:flex-col items-stretch gap-6">

            {/* Attendance Card Wrapper */}
            <div className="flex-1 min-w-0">
                <AttendanceCard
                    userName={currentUser.name || 'Employee'} // Use 'name' from your User object
                    status={status}
                    checkInTime={checkInTime}
                    checkOutTime={checkOutTime}
                    elapsedTime={elapsedTime}
                    onCheckIn={handleCheckIn}
                    onCheckOut={handleCheckOut}
                    loading={attendanceLoading}
                />
            </div>

            {/* Attendance Log Card Wrapper */}
            <div className="flex-1 min-w-0">
                <AttendanceLogCard log={log} />
            </div>

        </div>
    );
};