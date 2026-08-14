import { getFunctions, httpsCallable } from 'firebase/functions';

export interface CouponValidationResult {
    valid: boolean;
    message: string;
    baseAmount: number;
    discountAmount: number;
    taxRate: number;
    taxAmount: number;
    finalAmount: number;
}

export const validateCoupon = async (code: string, planId: string): Promise<CouponValidationResult> => {
    const functions = getFunctions();
    const fn = httpsCallable(functions, 'validateCoupon');
    const result = await fn({ code, planId });
    return result.data as CouponValidationResult;
};

export interface RazorpayOrderResult {
    orderId: string;
    amount: number;
    baseAmount: number;
    discountAmount: number;
    taxAmount: number;
    currency: string;
    keyId: string;
}

export const createRazorpayOrder = async (planId: string, couponCode?: string): Promise<RazorpayOrderResult> => {
    const functions = getFunctions();
    const fn = httpsCallable(functions, 'createRazorpayOrder');
    const result = await fn({ planId, couponCode: couponCode || null });
    return result.data as RazorpayOrderResult;
};

export const verifyRazorpayPayment = async (
    orderId: string,
    paymentId: string,
    signature: string
): Promise<{ status: string; message: string }> => {
    const functions = getFunctions();
    const fn = httpsCallable(functions, 'verifyRazorpayPayment');
    const result = await fn({ orderId, paymentId, signature });
    return result.data as { status: string; message: string };
};
