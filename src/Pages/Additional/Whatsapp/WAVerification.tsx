import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import QRCodeLib from 'qrcode';
import JsBarcode from 'jsbarcode';
import { FiSmartphone, FiCheckCircle, FiRefreshCw, FiAlertCircle, FiCode } from 'react-icons/fi';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import TermsAgreementModal from './TermsAndCondition';
import { ROUTES } from '../../../constants/routes.constants';
import { Stepper } from '../../../Components/Stepper';
import { botMasterService } from './WhatsappApi';
import { useAuth } from '../../../context/auth-context';
import { db } from '../../../lib/Firebase';

const WhatsAppVerification: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { currentUser } = useAuth();

    // Data from previous page
    const initialPhone = location.state?.phoneNumber || '';
    const passedToken = location.state?.authToken;

    // --- State ---
    const [internalStep, setInternalStep] = useState<'CREATE_SESSION' | 'GET_QR' | 'DISPLAY_QR' | 'SUCCESS'>('CREATE_SESSION');
    const [phone, setPhone] = useState(initialPhone);
    const [authToken, setAuthToken] = useState<string | null>(passedToken || null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [showTerms, setShowTerms] = useState(false);
    const [qrCodeData, setQrCodeData] = useState<string | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [isAuthenticating, setIsAuthenticating] = useState(false); // NEW: Tracks the "Logging In" phase

    // Timer state for the 25s refresh
    const [timeLeft, setTimeLeft] = useState(25);

    const qrCanvasRef = useRef<HTMLCanvasElement>(null);
    const barcodeCanvasRef = useRef<SVGSVGElement>(null);

    // --- FUNCTION TO SAVE CREDENTIALS TO FIREBASE ON SUCCESS ---
    const confirmAndSaveConnection = async () => {
        const companyId = (currentUser as any)?.companyId || currentUser?.uid;

        if (!companyId || !currentUser?.uid || !authToken || !phone) {
            console.error("Missing credentials or user ID to save!");
            return;
        }

        try {
            const businessDocRef = doc(db, 'companies', companyId, 'business_info', companyId);
            const userDocRef = doc(db, 'companies', companyId, 'users', currentUser.uid);

            const businessData = { botMasterToken: authToken, whatsappNumber: phone, isWhatsappConnected: true };
            const userData = { botMasterToken: authToken, phoneNumber: phone, isWhatsappConnected: true };

            await Promise.all([
                setDoc(businessDocRef, businessData, { merge: true }),
                setDoc(userDocRef, userData, { merge: true })
            ]);

            console.log("Credentials securely saved to both company profile and user profile!");
        } catch (error) {
            console.error("Failed to save credentials to Firebase:", error);
        }
    };

    // --- 1. SILENT AUTO-REFRESH & STATUS POLLING ---
    useEffect(() => {
        let refreshInterval: NodeJS.Timeout;
        let statusInterval: NodeJS.Timeout;

        if (internalStep === 'DISPLAY_QR' && !isConnected) {
            checkStatus();

            refreshInterval = setInterval(() => {
                setTimeLeft((prev) => {
                    if (isAuthenticating) return prev; // Freeze timer if currently authenticating
                    if (prev <= 1) {
                        handleFetchQR(0);
                        return 25;
                    }
                    return prev - 1;
                });
            }, 1000);

            // Poll faster (every 2s) to catch the exact moment they scan
            statusInterval = setInterval(() => {
                checkStatus();
            }, 2000);
        }

        return () => {
            clearInterval(refreshInterval);
            clearInterval(statusInterval);
        };
    }, [internalStep, isConnected, authToken, phone, isAuthenticating]);

    const checkStatus = async () => {
        if (!authToken) return;
        try {
            const response = await botMasterService.getMe(authToken, phone);

            const statusStr = response.data?.status || response.status || response.state || '';
            const statusUpper = typeof statusStr === 'string' ? statusStr.toUpperCase() : '';

            // Trap for intermediate scanning state
            if (statusUpper === 'AUTHENTICATING' || statusUpper === 'LOGGING_IN' || statusUpper === 'PAIRING') {
                setIsAuthenticating(true);
            }
            // Trap for full connection
            else if (statusUpper === 'CONNECTED' || (response.success && statusUpper === 'CONNECTED')) {
                setIsAuthenticating(false);
                setIsConnected(true);
                setInternalStep('SUCCESS');
                await confirmAndSaveConnection();
            }
        } catch (err) {
            console.error("Status check failed", err);
        }
    };

    // --- 2. RESTORE TOKEN IF REFRESHED ---
    useEffect(() => {
        if (!authToken && currentUser) {
            const fetchToken = async () => {
                try {
                    const companyId = (currentUser as any).companyId || currentUser.uid;
                    const businessDoc = await getDoc(doc(db, 'companies', companyId, 'business_info', companyId));
                    if (businessDoc.exists()) {
                        const data = businessDoc.data();
                        if (data.botMasterToken) setAuthToken(data.botMasterToken);
                        if (data.whatsappNumber && !phone) setPhone(data.whatsappNumber);
                    }
                } catch (err) { console.error(err); }
            };
            fetchToken();
        }
    }, [currentUser, authToken, phone]);

    // --- 3. STEP 1: CREATE SESSION ---
    const handleLinkNumber = async (e: React.MouseEvent) => {
        e.preventDefault();
        if (!authToken) {
            setError("Registration incomplete. Go back to Details page.");
            return;
        }
        setLoading(true);
        setError('');

        try {
            const response = await botMasterService.createSession(authToken, phone);

            const isAlreadyExists =
                response?.error?.data?.state === 'ALREADY_CONNECTED' ||
                response?.message?.toLowerCase().includes('already') ||
                response?.error?.toLowerCase().includes('already') ||
                response?.message?.toLowerCase().includes('exists');

            if (response.success || response.status === 201 || response.message?.includes("linked") || isAlreadyExists) {
                setInternalStep('GET_QR');
            } else {
                throw new Error(response.message || response.error || "Failed to link number");
            }
        } catch (err: any) {
            const errorData = err.response?.data;
            const isAlreadyExists =
                errorData?.error?.data?.state === 'ALREADY_CONNECTED' ||
                errorData?.message?.toLowerCase().includes('already') ||
                errorData?.error?.toLowerCase().includes('already') ||
                errorData?.message?.toLowerCase().includes('exists');

            if (isAlreadyExists) {
                setError('');
                setInternalStep('GET_QR');
            } else {
                setError(errorData?.message || err.message || "Could not link number.");
            }
        } finally {
            setLoading(false);
        }
    };

    // --- 4. STEP 2: FETCH QR CODE ---
    const handleFetchQR = async (retryCount: number = 0) => {
        if (!authToken || isConnected) return;
        if (retryCount === 0 && !qrCodeData) setLoading(true);

        try {
            const response = await botMasterService.getQrCode(authToken!, phone);

            const isSessionActive =
                response?.error?.data?.state === 'ALREADY_CONNECTED' ||
                response?.error?.message === 'Session already connected' ||
                response?.message === 'Session already connected';

            if (isSessionActive) {
                setIsConnected(true);
                setInternalStep('SUCCESS');
                await confirmAndSaveConnection();
                setLoading(false);
                return;
            }

            const qrImage = typeof response === 'string'
                ? response
                : (response.baileys_response?.data?.qrCode || response.baileys_response?.data?.qrcode);

            if (qrImage && qrImage.startsWith('data:image')) {
                setQrCodeData(qrImage);
                if (internalStep === 'GET_QR') setShowTerms(true);
                setLoading(false);
            } else if (retryCount < 5) {
                setTimeout(() => handleFetchQR(retryCount + 1), 2000);
            } else {
                setLoading(false);
            }
        } catch (err: any) {
            if (err?.response?.data?.error?.data?.state === 'ALREADY_CONNECTED') {
                setIsConnected(true);
                setInternalStep('SUCCESS');
                await confirmAndSaveConnection();
                setLoading(false);
                return;
            }
            setLoading(false);
        }
    };

    const handleTermsAccepted = () => {
        setShowTerms(false);
        setInternalStep('DISPLAY_QR');
    };

    // --- 5. RENDERERS ---
    useEffect(() => {
        if (internalStep === 'DISPLAY_QR' && qrCodeData && qrCanvasRef.current && !isAuthenticating) {
            if (!qrCodeData.startsWith('data:image')) {
                try {
                    QRCodeLib.toCanvas(qrCanvasRef.current, qrCodeData, { width: 256, margin: 2 });
                } catch (e) { console.error(e); }
            }
        }
    }, [internalStep, qrCodeData, isAuthenticating]);

    useEffect(() => {
        if (internalStep === 'SUCCESS' && barcodeCanvasRef.current) {
            try {
                JsBarcode(barcodeCanvasRef.current, phone, { format: "CODE128", displayValue: true });
            } catch (e) { console.error(e); }
        }
    }, [internalStep, phone]);

    const handleGlobalStepClick = (step: number) => {
        if (step === 1) navigate(ROUTES.WHATSAPP_PLAN);
        else if (step === 2) navigate(ROUTES.WHATSAPP_DETAILS, { state: { ...location.state } });
    };

    return (
        <div className="min-h-screen bg-muted flex flex-col font-sans">
            {/* Stepper Header (Only visible when modal is NOT open) */}
            <div className="sticky top-0 z-40 w-full backdrop-blur-sm transition-all duration-300">
                <div className="max-w-md mx-auto px-6 py-4">
                    <Stepper totalSteps={3} currentStep={3} onStepClick={handleGlobalStepClick} activeClassName="bg-emerald-600 text-white" completedClassName="bg-emerald-100 text-emerald-600" connectorClassName="bg-emerald-600" />
                    <div className="flex justify-between text-[10px] font-bold text-muted-foreground uppercase tracking-wider mt-2 px-1">
                        <span>Select Plan</span><span>Details</span><span className="text-emerald-600">Verification</span>
                    </div>
                </div>
            </div>

            <div className="flex-1 flex flex-col items-center justify-center p-4 pt-8">
                <TermsAgreementModal isOpen={showTerms} onAccept={handleTermsAccepted} />

                {/* --- MAIN BACKGROUND CARD --- */}
                <div className="max-w-md w-full bg-card rounded-xl shadow-lg border border-border overflow-hidden relative z-10">
                    <div className="bg-card p-6 border-b border-border flex items-center justify-between">
                        <h1 className="text-xl font-bold text-foreground">WhatsApp Verification</h1>
                        {internalStep !== 'SUCCESS' && (
                            <span className="text-xs font-mono bg-emerald-50 text-emerald-600 px-2 py-1 rounded">
                                {internalStep === 'CREATE_SESSION' ? 'Step 1' : 'Step 2'}
                            </span>
                        )}
                    </div>

                    <div className="p-8">
                        {error && (
                            <div className="mb-6 p-3 bg-red-50 text-red-600 text-sm rounded border border-red-100 flex items-center">
                                <FiAlertCircle className="mr-2 flex-shrink-0" />
                                {error}
                            </div>
                        )}

                        {/* --- PAGE 1: CREATE SESSION --- */}
                        {internalStep === 'CREATE_SESSION' ? (
                            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                                <div className="text-center">
                                    <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <FiSmartphone className="w-8 h-8" />
                                    </div>
                                    <h3 className="text-foreground font-bold">Step 1: Initialize Session</h3>
                                    <p className="text-muted-foreground text-sm mt-1">Confirm your number to start a secure WhatsApp session.</p>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">WhatsApp Number</label>
                                    <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full p-4 bg-muted border border-border rounded-lg text-lg font-medium outline-none focus:ring-2 focus:ring-blue-500" />
                                </div>
                                <button onClick={handleLinkNumber} disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 rounded-lg shadow-md flex items-center justify-center transition-all">
                                    {loading ? <FiRefreshCw className="animate-spin" /> : "Create Session"}
                                </button>
                            </div>
                        ) : (
                            /* --- PAGE 2: GET QR CODE (Sits behind the modal) --- */
                            <div className="space-y-6 animate-in fade-in duration-300">
                                <div className="text-center">
                                    <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <FiCheckCircle className="w-8 h-8" />
                                    </div>
                                    <h3 className="text-foreground font-bold">Session Active!</h3>
                                    <p className="text-muted-foreground text-sm mt-1">Session created for <strong>{phone}</strong>.</p>
                                </div>
                                <button
                                    onClick={() => handleFetchQR(0)}
                                    disabled={loading || internalStep === 'DISPLAY_QR'}
                                    className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-semibold py-4 rounded-lg shadow-md flex items-center justify-center transition-all"
                                >
                                    {loading ? <FiRefreshCw className="animate-spin mr-2" /> : <><FiCode className="mr-2" /> Get QR Code</>}
                                </button>
                                <button onClick={() => setInternalStep('CREATE_SESSION')} className="w-full text-xs text-muted-foreground hover:text-muted-foreground">Back to Number</button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* --- FULL-SCREEN POPUP MODAL FOR QR SCANNING & SUCCESS --- */}
            {(internalStep === 'DISPLAY_QR' || internalStep === 'SUCCESS') && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-gray-900/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-card w-full max-w-sm rounded-2xl shadow-2xl p-8 relative flex flex-col items-center animate-in zoom-in-95 duration-300">

                        {/* --- MODAL CONTENT: DISPLAY QR --- */}
                        {internalStep === 'DISPLAY_QR' && (
                            <div className="w-full flex flex-col items-center space-y-6">
                                {isAuthenticating ? (
                                    <div className="py-12 flex flex-col items-center justify-center space-y-4">
                                        <FiRefreshCw className="animate-spin text-emerald-600 w-12 h-12" />
                                        <h3 className="text-lg font-bold text-foreground">Device Scanned!</h3>
                                        <p className="text-sm text-muted-foreground text-center">Logging in and securely syncing your chats...</p>
                                    </div>
                                ) : (
                                    <>
                                        <div className="bg-green-50 text-green-800 px-4 py-2 rounded-full text-sm font-semibold flex items-center">
                                            <FiCheckCircle className="mr-2" /> Ready to Scan
                                        </div>
                                        <div className="text-center space-y-1">
                                            <h3 className="font-bold text-foreground text-lg">Scan to Link</h3>
                                            <p className="text-xs text-muted-foreground">Open WhatsApp &gt; Settings &gt; Linked Devices &gt; Scan</p>
                                        </div>
                                        {qrCodeData && (
                                            <div className="p-4 bg-card border-2 border-dashed border-border rounded-xl">
                                                {qrCodeData.startsWith('data:image') ? (
                                                    <img src={qrCodeData} alt="WhatsApp QR Code" className="w-56 h-56 mx-auto object-contain" />
                                                ) : (
                                                    <canvas ref={qrCanvasRef}></canvas>
                                                )}
                                            </div>
                                        )}
                                        <div className="flex flex-col items-center w-full bg-muted p-3 rounded-lg">
                                            <p className="text-xs text-muted-foreground uppercase tracking-widest font-bold">
                                                QR Refreshes in <span className="text-emerald-600 text-sm">{timeLeft}s</span>
                                            </p>
                                            <p className="text-[10px] text-muted-foreground italic mt-1 text-center">
                                                Keep this window open. It will automatically redirect when connected.
                                            </p>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}

                        {/* --- MODAL CONTENT: SUCCESS --- */}
                        {internalStep === 'SUCCESS' && (
                            <div className="w-full flex flex-col items-center text-center space-y-6">
                                <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center shadow-inner">
                                    <FiCheckCircle className="w-10 h-10" />
                                </div>
                                <div>
                                    <h2 className="text-2xl font-bold text-foreground">Connected!</h2>
                                    <p className="text-muted-foreground text-sm mt-1">Your WhatsApp account is securely linked.</p>
                                </div>
                                <svg ref={barcodeCanvasRef} className="w-full h-20"></svg>
                                <button onClick={() => navigate(ROUTES.WHATSAPP_LANDING)} className="w-full bg-gray-900 text-white font-semibold py-4 rounded-lg hover:bg-black transition-all shadow-lg text-lg mt-4">
                                    Go to Dashboard
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default WhatsAppVerification;