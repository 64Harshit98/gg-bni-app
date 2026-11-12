const RAZORPAY_SCRIPT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

let loadPromise: Promise<boolean> | null = null;

// Injects the Razorpay Checkout script once and resolves when window.Razorpay is ready.
// Per https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/
export const loadRazorpayCheckoutScript = (): Promise<boolean> => {
    if ((window as any).Razorpay) return Promise.resolve(true);
    if (loadPromise) return loadPromise;

    loadPromise = new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = RAZORPAY_SCRIPT_SRC;
        script.onload = () => resolve(true);
        script.onerror = () => {
            loadPromise = null;
            resolve(false);
        };
        document.body.appendChild(script);
    });

    return loadPromise;
};

export interface RazorpayCheckoutOptions {
    keyId: string;
    orderId: string;
    amount: number; // rupees
    currency: string;
    name: string;
    description: string;
    prefill?: { name?: string; email?: string; contact?: string };
    onSuccess: (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => void;
    onDismiss?: () => void;
}

export const openRazorpayCheckout = (options: RazorpayCheckoutOptions): void => {
    const Razorpay = (window as any).Razorpay;
    if (!Razorpay) throw new Error('Razorpay checkout script is not loaded.');

    const rzp = new Razorpay({
        key: options.keyId,
        order_id: options.orderId,
        amount: options.amount * 100,
        currency: options.currency,
        name: options.name,
        description: options.description,
        prefill: options.prefill,
        handler: options.onSuccess,
        modal: {
            ondismiss: options.onDismiss,
        },
        theme: { color: '#2563eb' },
    });

    rzp.open();
};
