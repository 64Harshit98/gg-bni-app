import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import type { CatalogueSalesSettings } from '../Catalogue/Settings/CatalogueSalesSetting'
import { ShoppingCart, Minus, Plus, Pin } from 'lucide-react';
import { useAuth } from '../context/auth-context';
import type { Item, ItemGroup } from '../constants/models';
import { FiPackage, FiPlus } from 'react-icons/fi';
import { ItemDetailDrawer } from '../Components/ItemDetails';
import { Spinner } from '../constants/Spinner';
import { useParams, useNavigate } from 'react-router-dom';
import Footer from './Footer';
import { useBusinessName } from './hooks/BusinessName';
import SearchBar from './SearchBar';
import { serverTimestamp, doc, setDoc, getDoc, getDocs, updateDoc, collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../lib/Firebase';
import { useLocation } from 'react-router-dom';
import LeadPopUp from './PopUp';
import BulkQuotePopup from './BulkQuotePopup';
import { getItemGroupsByCompany, getItemsByCompany } from '../lib/ItemsFirebase';
import { FaWhatsapp } from 'react-icons/fa';
import { ensurePendingApprovalEntry } from './hooks/ensureApprovalEntry';
import { deriveTaxContext, buildUpcomingSyncPayload } from './CheckOut/checkOut.calculations';
import type { CartItem } from './CheckOut/checkOut.types';

const ITEMS_PER_BATCH_RENDER = 24;

const generateSlug = (name: string) => {
    return name
        .toLowerCase()
        .trim()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "");
};

const getEffectivePriceInfo = (item: Item) => {
    const mrp = Number(item.mrp || 0);
    const itemSalesPrice = Number(item.salesPrice || 0);
    const presetDiscount = Number(item.discount || 0);

    let salePrice = 0;
    let calculatedDiscount = 0;

    if (mrp > 0 && itemSalesPrice > 0) {
        // Case 1: Both exist. Ignore DB discount. Calculate diff.
        salePrice = itemSalesPrice;
        calculatedDiscount = ((mrp - itemSalesPrice) / mrp) * 100;
    } else if (itemSalesPrice > 0) {
        // Case 2: Only Sales Price exists. Apply DB discount.
        calculatedDiscount = presetDiscount;
        salePrice = itemSalesPrice * (1 - (presetDiscount / 100));
    } else if (mrp > 0) {
        // Case 3: Only MRP exists. Apply DB discount.
        calculatedDiscount = presetDiscount;
        salePrice = mrp * (1 - (presetDiscount / 100));
    }

    // Round to 2 decimal places to ensure clean UI numbers
    salePrice = Math.round((salePrice + Number.EPSILON) * 100) / 100;

    return {
        mrp,
        salePrice,
        discountPercent: Math.round(calculatedDiscount),
        hasDiscount: calculatedDiscount > 0,
        hasBothPrices: mrp > 0 && salePrice > 0 && salePrice < mrp
    };
};
// Self-contained slideshow for a grid card's image area.
const ProductCardImage: React.FC<{ images: string[]; alt: string }> = ({ images, alt }) => {
    const [slideIndex, setSlideIndex] = useState(0);
    const [brokenUrls, setBrokenUrls] = useState<Set<string>>(new Set());

    // Only keep images that haven't failed to load
    const validImages = useMemo(
        () => images.filter(url => !brokenUrls.has(url)),
        [images, brokenUrls]
    );

    useEffect(() => {
        if (validImages.length <= 1) return;
        const timer = setInterval(() => {
            setSlideIndex(prev => (prev + 1) % validImages.length);
        }, 3000);
        return () => clearInterval(timer);
    }, [validImages.length]);

    // Keep slideIndex in range if a broken image shrinks the list
    useEffect(() => {
        if (slideIndex >= validImages.length) {
            setSlideIndex(0);
        }
    }, [validImages.length, slideIndex]);

    if (validImages.length === 0) {
        return <FiPackage className="w-10 h-10 text-gray-200" />;
    }

    return (
        <>
            {validImages.map((url, idx) => (
                <img
                    key={url + idx}
                    src={url}
                    alt={alt}
                    onError={() => {
                        setBrokenUrls(prev => {
                            if (prev.has(url)) return prev;
                            const next = new Set(prev);
                            next.add(url);
                            return next;
                        });
                    }}
                    className={`absolute inset-0 object-contain w-full h-full transition-opacity duration-700 ease-in-out group-hover:scale-110 ${idx === slideIndex ? 'opacity-100' : 'opacity-0'}`}
                />
            ))}
            {validImages.length > 1 && (
                <div className="absolute bottom-1 left-0 right-0 flex items-center justify-center gap-1">
                    {validImages.map((_, idx) => (
                        <span
                            key={idx}
                            className={`h-1 rounded-sm transition-all duration-300 ${idx === slideIndex ? 'w-3 bg-[#F97316]' : 'w-1 bg-white/80'}`}
                        />
                    ))}
                </div>
            )}
        </>
    );
};

const SharedProduct: React.FC = () => {
    const navigate = useNavigate();
    const { companyId: pathId, groupId: groupSlug } = useParams<{
        companyId: string;
        groupId: string;
    }>();

    // 1. Add states for subdomain resolution
    const [resolvedCompanyId, setResolvedCompanyId] = useState<string | null>(null);
    const [domainResolveError, setDomainResolveError] = useState(false);

    // 2. Safely extract the subdomain
    const hostname = window.location.hostname;
    const parts = hostname.split('.');
    const subdomain = useMemo(() => {
        return (
            parts.length >= 3 &&
            !['www', 'app'].includes(parts[0].toLowerCase()) &&
            !hostname.includes('localhost')
        ) ? parts[0] : null;
    }, [hostname, parts]);

    // 3. Resolve the subdomain string into the true Firestore Document ID
    useEffect(() => {
        const resolveDomain = async () => {
            if (subdomain) {
                try {
                    // Query the companies collection for the matching subdomain alias
                    const companiesRef = collection(db, 'companies');
                    const q = query(companiesRef, where('domainAliases', 'array-contains', subdomain));
                    const snap = await getDocs(q);

                    if (!snap.empty) {
                        const companyDoc = snap.docs[0];
                        const data = companyDoc.data();

                        // Redirect logic: If they used an old link, push them to the new active one
                        if (data.subdomain && data.subdomain !== subdomain) {
                            window.location.replace(`https://${data.subdomain}.sellar.in`);
                            return;
                        }

                        // Success: Set the actual Firestore ID
                        setResolvedCompanyId(companyDoc.id);
                    } else {
                        // Subdomain does not exist in the database
                        setDomainResolveError(true);
                    }
                } catch (error) {
                    console.error("Error resolving subdomain:", error);
                    setDomainResolveError(true);
                }
            } else if (pathId) {
                // If visited via standard Firebase Hosting (/catalogue/:companyId)
                setResolvedCompanyId(pathId);
            } else {
                setDomainResolveError(true);
            }
        };

        resolveDomain();
    }, [subdomain, pathId]);

    // 4. Point the effective ID to the newly resolved state
    const effectiveCompanyId = resolvedCompanyId;

    const { businessName: companyName } = useBusinessName(effectiveCompanyId || "");
    const location = useLocation();
    const highlightItemId = location.state?.highlightItemId;
    const highlightTrigger = location.state?.trigger;
    const { currentUser, loading: authLoading } = useAuth();
    const [activeHighlight, setActiveHighlight] = useState<string | null>(null);
    const [allItems, setAllItems] = useState<Item[]>([]);
    const [allItemGroups, setAllItemGroups] = useState<ItemGroup[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [pageIsLoading, setPageIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [catalogueSettings, setCatalogueSettings] = useState<CatalogueSalesSettings | null>(null);
    const [itemsToRenderCount, setItemsToRenderCount] = useState(ITEMS_PER_BATCH_RENDER);
    const [isDetailDrawerOpen, setIsDetailDrawerOpen] = useState(false);
    const [_isLeadFilled, setIsLeadFilled] = useState(false);
    const [forceLeadOpen, setForceLeadOpen] = useState(false);
    const [timedPopupFired, setTimedPopupFired] = useState(false);
    const [selectedItemForDetails, setSelectedItemForDetails] = useState<Item | null>(null);
    const [variantGroupIds, setVariantGroupIds] = useState<string[]>([]);
    const [socialLinks, setSocialLinks] = useState<any>({});
    const whatsappLink = useMemo(() => {
        const rawNumber = socialLinks?.whatsappNumber || socialLinks?.phoneNumber || '';
        const digits = rawNumber.replace(/\D/g, '');
        if (!digits) return null;
        const fullNumber = digits.length === 10 ? `91${digits}` : digits;
        const message = encodeURIComponent(`Hi, I'm interested in your products at ${companyName}.`);
        return `https://wa.me/${fullNumber}?text=${message}`;
    }, [socialLinks, companyName]);
    const observerRef = useRef<IntersectionObserver | null>(null);
    const loadMoreRef = useRef<HTMLDivElement | null>(null);
    const [sortOrder, setSortOrder] = useState<'A-Z' | 'Z-A' | 'Price: Low-High' | 'Price: High-Low'>('A-Z');
    const [isSortOpen, setIsSortOpen] = useState(false);
    const [cart, setCart] = useState<{ item: Item; quantity: number }[]>([]);
    const [leadStatus, setLeadStatus] = useState<"approved" | "pending" | "declined" | null>(null);
    const [_checkingApproval, setCheckingApproval] = useState<boolean>(true);
    const [leadPhone, setLeadPhone] = useState<string>("");
    const [showNotifySuccess, setShowNotifySuccess] = useState(false);
    const [showPersonalizationSuccess, setShowPersonalizationSuccess] = useState(false);
    const [notifiedItems, setNotifiedItems] = useState<Record<string, boolean>>({});
    const [isScrolled, setIsScrolled] = useState(false);
    const [isSearchSticky, setIsSearchSticky] = useState(false);
    const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
    const [bulkQuoteItem, setBulkQuoteItem] = useState<Item | null>(null);
    const [pendingBulkItem, setPendingBulkItem] = useState<Item | null>(null); // saved while lead popup is open
    const [personalizationItem, setPersonalizationItem] = useState<Item | null>(null);
    const [personalizationText, setPersonalizationText] = useState('');
    const [pendingPersonalizationItem, setPendingPersonalizationItem] = useState<Item | null>(null);
    const [pendingNotifyItem, setPendingNotifyItem] = useState<Item | null>(null);
    const [pendingCartItem, setPendingCartItem] = useState<Item | null>(null);

    useEffect(() => {
        if (!effectiveCompanyId) return;
        const ref = doc(db, 'companies', effectiveCompanyId, 'settings', 'pinned_items');
        const unsubscribe = onSnapshot(ref, (snap) => {
            if (snap.exists()) {
                setPinnedIds(new Set(snap.data().ids || []));
            } else {
                setPinnedIds(new Set());
            }
        });
        return () => unsubscribe();
    }, [effectiveCompanyId]);
    const cartIconRef = useRef<HTMLDivElement | null>(null);
    const highlightTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const getUserKey = () => {
        let key = localStorage.getItem('guest_uid');
        if (!key) {
            key = crypto.randomUUID();
            localStorage.setItem('guest_uid', key);
        }
        return key;
    };
    const isUserApproved = leadStatus === "approved";
    const isUserDeclined = leadStatus === "declined";
    const isUserPending = leadStatus === "pending";
    const approvalEnabled = catalogueSettings?.requireApproval === true;
    const hidePriceEnabled = catalogueSettings?.hidePrice === true;
    const cartCount = useMemo(() => cart.reduce((acc, curr) => acc + curr.quantity, 0), [cart]);

    const resolvedGroupId = useMemo(() => {
        if (!groupSlug || allItemGroups.length === 0) return groupSlug;

        const matchedGroup = allItemGroups.find(
            (group) => generateSlug(group.name) === groupSlug
        );

        return matchedGroup?.id || groupSlug; // fallback for old ID-based links
    }, [groupSlug, allItemGroups]);

    const cartTotal = useMemo(() => {
        return cart.reduce((acc, curr) => {
            const { salePrice } = getEffectivePriceInfo(curr.item);
            return acc + salePrice * curr.quantity;
        }, 0);
    }, [cart]);

    const syncToUpcoming = async (
        updatedCart: { item: Item; quantity: number }[]
    ) => {
        if (!effectiveCompanyId || updatedCart.length === 0) return;

        const leadSubmittedCheck = localStorage.getItem("leadSubmitted") === "true";
        if (approvalEnabled && !leadSubmittedCheck) return;

        try {
            const leadData = JSON.parse(
                localStorage.getItem("leadData") || "{}"
            );
            // number normalize
            const cleanNumber = (leadData.number || "")
                .replace(/\D/g, "")
                .trim();

            // STABLE UPCOMING KEY (FIXED)
            let userKey: string =
                localStorage.getItem("upcoming_user_key") || "";

            if (!userKey) {
                userKey =
                    cleanNumber ||
                    currentUser?.uid ||
                    getUserKey();

                localStorage.setItem("upcoming_user_key", userKey);
            }

            const loginName = currentUser?.name || "Guest User";

            // Apply the same tax-aware calculation the real checkout flow uses
            // (buildUpcomingSyncPayload) so this draft's total matches what
            // placeOrder() will actually charge once the customer checks out —
            // previously this summed raw discounted price * qty with no tax
            // split at all, understating the total whenever tax is exclusive.
            const { scheme, taxType } = deriveTaxContext(catalogueSettings);
            const cartItemsForTax: CartItem[] = updatedCart.map(c => {
                const { salePrice, mrp } = getEffectivePriceInfo(c.item);
                return {
                    id: c.item.id ?? '',
                    name: c.item.name,
                    category: '',
                    mrp,
                    salesPrice: salePrice,
                    quantity: c.quantity,
                    image: '',
                    note: '',
                    unit: c.item.unit,
                    unitMultiplier: c.item.unitMultiplier ?? 1,
                    tax: c.item.tax,
                };
            });
            const { itemsForFirebase: taxedItems, totalAmount: computedTotalAmount } =
                buildUpcomingSyncPayload(cartItemsForTax, scheme, taxType);

            const itemsForFirebase = updatedCart.map((c, idx) => ({
                id: String(c.item.id),
                docId: c.item.firestoreDocId || c.item.id,
                name: c.item.name,
                quantity: c.quantity,

                mrp: taxedItems[idx].mrp,
                salesPrice: taxedItems[idx].salesPrice,

                unit: c.item.unit,
                unitMultiplier: c.item.unitMultiplier ?? 1,

                finalPrice: taxedItems[idx].finalPrice,
            }));

            const orderRef = doc(
                db,
                "companies",
                effectiveCompanyId,
                "Orders",
                `upcoming_${userKey}`
            );

            const snap = await getDoc(orderRef);
            const leadSubmitted =
                localStorage.getItem("leadSubmitted") === "true";

            const leadJustSubmitted =
                localStorage.getItem("leadJustSubmitted") === "true";

            //  BLOCK only when:
            // old lead AND upcoming doc exist nahi karta
            if (!leadSubmitted && !leadJustSubmitted && !snap.exists()) {
                return;
            }
            const invoiceNumber = snap.exists()
                ? snap.data().invoiceNumber
                : `DRAFT-${userKey}`;

            const existingData = snap.exists() ? snap.data() : {};

            const upcomingPayload: Record<string, any> = {
                orderId: invoiceNumber,
                invoiceNumber,
                userId: userKey,
                userName: existingData.userName || leadData.name || loginName || "Guest User",
                userLoginPhone: existingData.userLoginPhone || cleanNumber || "",
                status: "Upcoming",
                isLead: true,
                items: itemsForFirebase.map(i => {
                    const clean: Record<string, any> = {};
                    for (const [k, v] of Object.entries(i)) {
                        if (v !== undefined) clean[k] = v;
                    }
                    return clean;
                }),
                totalAmount: computedTotalAmount,
                paidAmount: 0,
                updatedAt: serverTimestamp(),
            };

            // createdAt only set if new doc
            if (!snap.exists()) {
                upcomingPayload.createdAt = serverTimestamp();
            }

            await setDoc(orderRef, upcomingPayload, { merge: true });
            localStorage.removeItem("leadJustSubmitted");
        } catch (err) {
            console.error("Sync Upcoming Error:", err);
        }
    };

    useEffect(() => {
        if (cart.length > 0) {
            syncToUpcoming(cart);
        }
    }, [cart]);

    useEffect(() => {
        const handleScroll = () => {
            setIsScrolled(window.scrollY > 50);
        };

        window.addEventListener("scroll", handleScroll);
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    useEffect(() => {
        if (showNotifySuccess) {
            const t = setTimeout(() => {
                setShowNotifySuccess(false);
            }, 3000);

            return () => clearTimeout(t);
        }
    }, [showNotifySuccess]);
    useEffect(() => {
        if (showPersonalizationSuccess) {
            const t = setTimeout(() => {
                setShowPersonalizationSuccess(false);
            }, 3000);

            return () => clearTimeout(t);
        }
    }, [showPersonalizationSuccess]);
    useEffect(() => {
        // Wait until settings are loaded
        if (!catalogueSettings) return;

        const alreadyFilled = localStorage.getItem("leadSubmitted") === "true";
        if (alreadyFilled) return;

        if (timedPopupFired) return;

        const timer = setTimeout(() => {
            setTimedPopupFired(true);
            setForceLeadOpen(true);
        }, 10000);

        return () => clearTimeout(timer);
    }, [catalogueSettings, timedPopupFired]);
    useEffect(() => {
        const handleScroll = () => {
            // Header ki approximate height
            const stickyTriggerPoint = 110;

            if (window.scrollY > stickyTriggerPoint) {
                setIsSearchSticky(true);
            } else {
                setIsSearchSticky(false);
            }
        };

        window.addEventListener("scroll", handleScroll);
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    const addToCart = useCallback((item: Item) => {
        // Always require name+number before adding to cart
        const alreadyFilled = localStorage.getItem("leadSubmitted") === "true";
        if (!alreadyFilled) {
            setPendingCartItem(item);
            setForceLeadOpen(false);
            setTimeout(() => setForceLeadOpen(true), 0);
            return;
        }
        // ensure this customer shows up in Approval Requests later if seller enables approval
        if (effectiveCompanyId) {
            const leadData = JSON.parse(localStorage.getItem("leadData") || "{}");
            const cleanNumber = (leadData.number || "").replace(/\D/g, "").trim();
            if (cleanNumber) {
                ensurePendingApprovalEntry(effectiveCompanyId, leadData.name || "Guest User", cleanNumber);
            }
        }

        // lead filled → cart allow
        setCart(prev => {
            const existing = prev.find(i => i.item.id === item.id);
            const moqQty = (item as any).moq || 1;
            const { salePrice, mrp } = getEffectivePriceInfo(item);

            const itemWithPrice = {
                ...item,
                tax: Number(item.tax ?? 0),
                unit: item.unit,
                unitMultiplier: item.unitMultiplier || 1,
                mrp: mrp,
                salesPrice: salePrice,
                groupid: resolvedGroupId || item.itemGroupId,
            };
            const newCart = existing
                ? prev.map(i =>
                    i.item.id === item.id
                        ? { ...i, quantity: i.quantity + moqQty }
                        : i
                )
                : [...prev, { item: itemWithPrice, quantity: moqQty }];

            localStorage.setItem(
                'temp_cart',
                JSON.stringify(
                    newCart.map(c => ({
                        item: {
                            ...c.item,
                            groupId: (c.item as any).groupid || c.item.itemGroupId  // preserve the captured group context
                        },
                        quantity: c.quantity
                    }))
                )
            );
            return newCart;
        });
    }, [approvalEnabled]);

    const handleNotifyRequest = async (item: Item) => {
        try {
            if (!effectiveCompanyId) return;

            // SAME CHECK as Add to Cart
            const alreadyFilled = !approvalEnabled || localStorage.getItem("leadSubmitted") === "true";

            // lead not filled → popup dikhao
            if (!alreadyFilled) {
                setPendingNotifyItem(item);
                setForceLeadOpen(false);
                setTimeout(() => setForceLeadOpen(true), 0);
                return;
            }

            const leadData = JSON.parse(
                localStorage.getItem("leadData") || "{}"
            );

            const name = leadData?.name || "Guest User";
            const number = (leadData?.number || "")
                .replace(/\D/g, "")
                .trim();

            if (!number) {
                setForceLeadOpen(true);
                return;
            }

            //  rest same
            const ref = doc(
                db,
                "companies",
                effectiveCompanyId,
                "NotifyRequests",
                number
            );

            const snap = await getDoc(ref);

            let existingItems: any[] = [];

            if (snap.exists()) {
                existingItems = snap.data()?.items || [];
            }

            const alreadyExists = existingItems.find(
                (i: any) => i.id === item.id
            );

            const updatedItems = alreadyExists
                ? existingItems
                : [
                    ...existingItems,
                    {
                        id: item.id,
                        name: item.name,
                        qty: 1,
                        inStock: (item.stock || 0) > 0,
                    },
                ];

            await setDoc(
                ref,
                {
                    customerName: name,
                    customerNumber: number,
                    type: "notify",
                    items: updatedItems,
                    inStock: false,
                    messageSent: false,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                },
                { merge: true }
            );
            // ensure this customer shows up in Approval Requests later if seller enables approval
            ensurePendingApprovalEntry(effectiveCompanyId, name, number);

            setShowNotifySuccess(true);
            setNotifiedItems(prev => ({ ...prev, [item.id!]: true }));
        } catch (err) {
            console.error("Notify error:", err);
        }
    };
    const handlePersonalizationSubmit = async (item: Item, note: string) => {
        try {
            if (!effectiveCompanyId) return;

            const alreadyFilled = localStorage.getItem("leadSubmitted") === "true";
            if (!alreadyFilled) {
                setPendingPersonalizationItem(item);
                setForceLeadOpen(false);
                setTimeout(() => setForceLeadOpen(true), 0);
                return;
            }

            const leadData = JSON.parse(localStorage.getItem("leadData") || "{}");
            const name = leadData?.name || "Guest User";
            const number = (leadData?.number || "").replace(/\D/g, "").trim();

            if (!number) { setForceLeadOpen(true); return; }

            const docKey = `${number}_${String(item.id ?? Date.now())}`;

            const ref = doc(
                db,
                "companies",
                effectiveCompanyId,
                "PersonalizationRequests",
                docKey
            );

            await setDoc(ref, {
                customerName: name || "Guest User",
                customerNumber: number,
                itemId: String(item.id ?? ""),
                itemName: String(item.name ?? "General Request"),
                itemImage: String(item.imageUrl ?? ""),
                note: note.trim(),
                status: "pending",
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            }, { merge: true });
            // ensure this customer shows up in Approval Requests later if seller enables approval
            ensurePendingApprovalEntry(effectiveCompanyId, name || "Guest User", number);

            setPersonalizationItem(null);
            setPersonalizationText('');
            setShowPersonalizationSuccess(true);
        } catch (err) {
            console.error("Personalization error:", err);
        }
    };
    const fetchUserNotifyStatus = async () => {
        try {
            if (!effectiveCompanyId) return;

            const leadData = JSON.parse(
                localStorage.getItem("leadData") || "{}"
            );

            const number = (leadData?.number || "")
                .replace(/\D/g, "")
                .trim();

            if (!number) return;

            const ref = doc(
                db,
                "companies",
                effectiveCompanyId,
                "NotifyRequests",
                number
            );

            const snap = await getDoc(ref);

            if (!snap.exists()) return;

            const items = snap.data()?.items || [];

            const map: Record<string, boolean> = {};

            items.forEach((i: any) => {
                if (i.id) {
                    map[i.id] = true;
                }
            });

            setNotifiedItems(map);
        } catch (err) {
            console.error("Fetch notify status error:", err);
        }
    };

    const syncNotifyStockStatus = async (items: Item[]) => {
        if (!effectiveCompanyId) return;

        try {
            const notifySnap = await getDocs(
                collection(db, "companies", effectiveCompanyId, "NotifyRequests")
            );

            const updates: Promise<any>[] = [];

            notifySnap.forEach(docSnap => {
                const data = docSnap.data();
                const notifyItems = (data.items || []).map((ni: any) => {
                    const matchedItem = items.find(i => i.id === ni.id);
                    const isNowInStock = matchedItem && (matchedItem.stock || 0) > 0;

                    return {
                        ...ni,
                        inStock: Boolean(isNowInStock)
                    };
                });
                // check if ANY item now in stock
                const isAnyAvailable = notifyItems.some(
                    (ni: any) => ni.inStock === true
                );

                // ALWAYS sync — not only when true
                if (data.inStock !== isAnyAvailable) {
                    updates.push(
                        updateDoc(docSnap.ref, {
                            inStock: isAnyAvailable,
                            items: notifyItems,
                            updatedAt: new Date(),
                        })
                    );
                }
            });
            await Promise.all(updates);
        } catch (err) {
            console.error("Notify stock sync error:", err);
        }
    };

    const animateToCart = (sourceEl: HTMLElement) => {
        if (!cartIconRef.current) return;

        const cartRect = cartIconRef.current.getBoundingClientRect();
        const imgRect = sourceEl.getBoundingClientRect();

        const clone = sourceEl.cloneNode(true) as HTMLElement;

        clone.style.position = "fixed";
        clone.style.left = `${imgRect.left}px`;
        clone.style.top = `${imgRect.top}px`;
        clone.style.width = `${imgRect.width}px`;
        clone.style.height = `${imgRect.height}px`;
        clone.style.transition = "all 0.6s ease";
        clone.style.zIndex = "9999";
        clone.style.pointerEvents = "none";

        document.body.appendChild(clone);

        requestAnimationFrame(() => {
            clone.style.left = `${cartRect.left}px`;
            clone.style.top = `${cartRect.top}px`;
            clone.style.width = "20px";
            clone.style.height = "20px";
            clone.style.opacity = "0.5";
        });

        setTimeout(() => {
            clone.remove();
        }, 600);
    };

    const updateQuantity = (itemId: string, delta: number) => {
        setCart(prev => {
            const newCart = prev
                .map(i => {
                    if (i.item.id === itemId) {
                        //  MOQ safe fallback
                        const moqQty =
                            (i.item as any).moq && (i.item as any).moq > 0
                                ? (i.item as any).moq
                                : 1;

                        const stepChange = delta > 0 ? 1 : -1;
                        const newQty = i.quantity + stepChange;

                        //  UNIVERSAL REMOVE RULE
                        if (newQty < moqQty) return null;

                        return { ...i, quantity: newQty };
                    }
                    return i;
                })
                .filter(Boolean) as { item: Item; quantity: number }[];

            localStorage.setItem('temp_cart', JSON.stringify(newCart));
            return newCart;
        });
    };

    useEffect(() => {
        // 1. Remove !currentUser from the guard so public users can pass
        if (authLoading || !effectiveCompanyId || !resolvedGroupId) return;

        const fetchData = async () => {
            try {
                setPageIsLoading(true);
                setError(null);

                // 2. Use direct library calls or manual Firestore queries 
                const [fetchedItemGroups, fetchedItems] = await Promise.all([
                    getItemGroupsByCompany(effectiveCompanyId),
                    getItemsByCompany(effectiveCompanyId)
                ]);

                // 3. Fetch Catalogue Sales Settings
                const settingsRef = doc(db, 'companies', effectiveCompanyId, 'settings', 'catalogue-sales-settings');
                const settingsSnap = await getDoc(settingsRef);
                if (settingsSnap.exists()) {
                    setCatalogueSettings(settingsSnap.data() as CatalogueSalesSettings);
                }

                // --- FIX: ADD PINNED ITEMS FETCH HERE ---
                const pinnedRef = doc(db, 'companies', effectiveCompanyId, 'settings', 'pinned_items');
                const pinnedSnap = await getDoc(pinnedRef);
                if (pinnedSnap.exists()) {
                    setPinnedIds(new Set(pinnedSnap.data().ids || []));
                } else {
                    setPinnedIds(new Set());
                }
                // ----------------------------------------

                // 4. Update state with fetched data
                setAllItemGroups(fetchedItemGroups);
                setAllItems(fetchedItems);

                // 5. Trigger side effects like stock sync
                syncNotifyStockStatus(fetchedItems);

                // 6. Fetch Business/Social Info
                const businessRef = doc(db, "companies", effectiveCompanyId, "business_info", effectiveCompanyId);
                const businessSnap = await getDoc(businessRef);
                if (businessSnap.exists()) {
                    setSocialLinks(businessSnap.data());
                }

            } catch (err: any) {
                console.error("Fetch Public Data Error:", err);
                setError(err instanceof Error ? err.message : 'Failed to load data.');
            } finally {
                setPageIsLoading(false);
            }
        };

        fetchData();

    }, [authLoading, effectiveCompanyId, resolvedGroupId]);

    useEffect(() => {
        if (!effectiveCompanyId) return;

        const leadData = JSON.parse(
            localStorage.getItem("leadData") || "{}"
        );

        const phone = (leadData.number || "")
            .replace(/\D/g, "")
            .trim();

        if (!phone) {
            setLeadStatus(null);
            setCheckingApproval(false);
            return;
        }

        setCheckingApproval(true);

        // DIRECT QUERY (REALTIME)
        const q = query(
            collection(db, "companies", effectiveCompanyId, "AuthorizedUser"),
            where("customerNumber", "==", phone)
        );

        const unsubscribe = onSnapshot(
            q,
            (snapshot) => {
                if (snapshot.empty) {
                    setLeadStatus(null);
                } else {
                    const data = snapshot.docs[0].data();
                    const status = data.status || "pending";
                    setLeadStatus(status);
                }

                setCheckingApproval(false);
            },
            (error) => {
                console.error("Realtime approval error:", error);
                setLeadStatus(null);
                setCheckingApproval(false);
            }
        );

        return () => unsubscribe();
    }, [effectiveCompanyId, leadPhone]);

    useEffect(() => {
        const leadData = JSON.parse(localStorage.getItem("leadData") || "{}");

        if (leadData?.number && localStorage.getItem("leadSubmitted")) {
            setIsLeadFilled(true);
        }
    }, []);

    useEffect(() => {
        fetchUserNotifyStatus();
    }, [effectiveCompanyId]);

    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const itemId = params.get("itemId");

        if (!itemId || allItems.length === 0) return;

        const selectedItem = allItems.find(
            (item) => String(item.id) === String(itemId)
        );

        if (selectedItem) {
            setSelectedItemForDetails(selectedItem);
            setIsDetailDrawerOpen(false);
        }
    }, [location.search, allItems]);

    // / Which images make up each item's slideshow: its own image + any item
    // it's linked to through `variants`.
    const itemSlideImagesMap = useMemo(() => {
        const listedItems = allItems.filter(i => i.isListed === true);
        const itemById = new Map(listedItems.map(i => [String(i.id), i]));

        const parent = new Map<string, string>();
        const find = (id: string): string => {
            if (!parent.has(id)) parent.set(id, id);
            let root = id;
            while (parent.get(root) !== root) root = parent.get(root)!;
            parent.set(id, root);
            return root;
        };
        const union = (a: string, b: string) => {
            const ra = find(a);
            const rb = find(b);
            if (ra !== rb) parent.set(ra, rb);
        };

        listedItems.forEach(item => {
            const id = String(item.id);
            find(id);
            const variantIds: string[] = ((item as any).variants || []).map(String);
            variantIds.forEach(vid => {
                if (itemById.has(vid)) union(id, vid);
            });
        });

        const groups = new Map<string, string[]>();
        listedItems.forEach(item => {
            const root = find(String(item.id));
            if (!groups.has(root)) groups.set(root, []);
            groups.get(root)!.push(String(item.id));
        });

        const map: Record<string, string[]> = {};
        listedItems.forEach(item => {
            const root = find(String(item.id));
            const groupIds = groups.get(root) || [String(item.id)];
            const images = groupIds
                .map(gid => itemById.get(gid)?.imageUrl)
                .filter((url): url is string => Boolean(url));
            map[String(item.id)] = images.length > 0 ? images : (item.imageUrl ? [item.imageUrl] : []);
        });

        return map;
    }, [allItems]);

    const filteredItems = useMemo(() => {
        const result = allItems.filter(item => {
            // Hide unlisted items
            if (!item.isListed) return false;

            // Hide out-of-stock items if setting is enabled
            if (
                catalogueSettings?.hideOutOfStock &&
                (item.stock || 0) <= 0
            ) {
                return false;
            }

            const allIds = [
                ...(item.itemGroupId ? [item.itemGroupId] : []),
                ...(item.itemGroupIds || []),
            ];
            const matchesGroup = allIds.includes(resolvedGroupId!);

            return (
                matchesGroup &&
                item.name.toLowerCase().includes(searchQuery.toLowerCase())
            );
        });

        return [...result].sort((a, b) => {
            const aPinned = pinnedIds.has(a.id!);
            const bPinned = pinnedIds.has(b.id!);
            if (aPinned !== bPinned) return aPinned ? -1 : 1;
            if (sortOrder === 'A-Z') return a.name.localeCompare(b.name);
            if (sortOrder === 'Z-A') return b.name.localeCompare(a.name);
            if (sortOrder === 'Price: Low-High') return (a.salesPrice || a.mrp || 0) - (b.salesPrice || b.mrp || 0);
            if (sortOrder === 'Price: High-Low') return (b.salesPrice || b.mrp || 0) - (a.salesPrice || a.mrp || 0);
            return 0;
        });
    }, [allItems, searchQuery, sortOrder, resolvedGroupId, catalogueSettings, pinnedIds]);


    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const itemIdFromQuery = params.get("itemId");

        const itemIdToHighlight =
            highlightItemId || itemIdFromQuery;

        if (!itemIdToHighlight || filteredItems.length === 0) return;

        const isSharedLink = Boolean(itemIdFromQuery);
        const triggerKey = highlightTrigger || "default";
        const sessionKey = `highlight_${itemIdToHighlight}_${triggerKey}`;

        // Prevent repeat highlight
        if (sessionStorage.getItem(sessionKey)) return;

        sessionStorage.setItem(sessionKey, "true");

        // Ensure item is rendered (for lazy loading)
        const itemIndex = filteredItems.findIndex(
            (item) => String(item.id) === String(itemIdToHighlight)
        );

        if (itemIndex !== -1) {
            setItemsToRenderCount(prev =>
                Math.max(prev, itemIndex + 1)
            );
        }

        // Clear previous timers
        if (highlightTimeoutRef.current) {
            clearTimeout(highlightTimeoutRef.current);
        }
        if (scrollTimeoutRef.current) {
            clearTimeout(scrollTimeoutRef.current);
        }

        // Apply highlight
        setActiveHighlight(itemIdToHighlight);

        // Smooth scroll after DOM render
        scrollTimeoutRef.current = setTimeout(() => {
            const element = document.getElementById(itemIdToHighlight);
            element?.scrollIntoView({
                behavior: "smooth",
                block: "center",
            });
        }, 200);

        // Remove highlight smoothly
        highlightTimeoutRef.current = setTimeout(() => {
            setActiveHighlight(null);

            if (isSharedLink) {
                navigate(location.pathname, { replace: true });
            }
        }, 1200);

        return () => {
            if (highlightTimeoutRef.current) {
                clearTimeout(highlightTimeoutRef.current);
            }
            if (scrollTimeoutRef.current) {
                clearTimeout(scrollTimeoutRef.current);
            }
        };
    }, [
        highlightItemId,
        highlightTrigger,
        location.search,
        filteredItems.length,
        navigate,
        location.pathname
    ]);

    const currentCategoryName = useMemo(() => {
        const group = allItemGroups.find(g => g.id === resolvedGroupId);
        return group ? group.name : 'Catalogue';
    }, [allItemGroups, resolvedGroupId]);

    const itemsToDisplay = useMemo(() => filteredItems.slice(0, itemsToRenderCount), [filteredItems, itemsToRenderCount]);
    const hasMoreItems = useMemo(() => itemsToRenderCount < filteredItems.length, [itemsToRenderCount, filteredItems.length]);

    const loadMoreItems = useCallback(() => {
        if (!hasMoreItems) return;
        setItemsToRenderCount(prev => prev + ITEMS_PER_BATCH_RENDER);
    }, [hasMoreItems]);

    useEffect(() => {
        if (!loadMoreRef.current) return;
        observerRef.current = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting && hasMoreItems) loadMoreItems();
        }, { threshold: 0.1 });
        observerRef.current.observe(loadMoreRef.current);
        return () => observerRef.current?.disconnect();
    }, [hasMoreItems, loadMoreItems]);

    useEffect(() => {
        const savedCart = localStorage.getItem('temp_cart');
        if (savedCart) {
            const parsed = JSON.parse(savedCart);
            setCart(parsed);
        }
    }, []);
    useEffect(() => {
        const handlePopState = () => {
            if (isDetailDrawerOpen) {
                setIsDetailDrawerOpen(false);
                setSelectedItemForDetails(null);
            }
        };
        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, [isDetailDrawerOpen]);
    useEffect(() => {
        setSearchQuery("")
    }, [resolvedGroupId])

    const resolveVariantGroup = (item: Item): string[] => {
        const itemId = String(item.id!);

        // Only consider listed items for public catalogue
        const listedItems = allItems.filter(i => i.isListed === true);

        // Walk the WHOLE connected component (forward + reverse edges, since
        // variant links can be one-way) and collect every member — not just
        // the "best" root's own declared variants array.
        const visited = new Set<string>();
        const queue = [itemId];

        while (queue.length > 0) {
            const currentId = queue.shift()!;
            if (visited.has(currentId)) continue;
            visited.add(currentId);

            const currentItem = listedItems.find(i => String(i.id) === currentId);
            if (!currentItem) continue;

            const currentVariants: string[] = ((currentItem as any).variants || [])
                .map(String)
                .filter((vid: string) => listedItems.some(i => String(i.id) === vid));

            currentVariants.forEach((vid: string) => { if (!visited.has(vid)) queue.push(vid); });

            listedItems.forEach(i => {
                const iVariants: string[] = ((i as any).variants || []).map(String);
                if (iVariants.includes(currentId) && !visited.has(String(i.id))) {
                    queue.push(String(i.id));
                }
            });
        }

        if (visited.size <= 1) return [itemId];

        // Stable order: always follow the catalogue's own item order, so the
        // variant chips never reshuffle depending on which variant is open.
        return listedItems
            .filter(i => visited.has(String(i.id)))
            .map(i => String(i.id));
    };

    const handleOpenDetailDrawer = (item: Item) => {
        setSelectedItemForDetails(item);
        setVariantGroupIds(resolveVariantGroup(item));
        setIsDetailDrawerOpen(true);
        // push a dummy history entry so hardware/browser back closes
        // the drawer first, instead of navigating away from the category page
        window.history.pushState({ drawerOpen: true }, '');
    };

    if (domainResolveError) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-[#E9F0F7] text-[#1A3B5D]">
                <h2 className="text-2xl font-black mb-2">Store Not Found</h2>
                <p className="text-gray-500 text-sm">This catalogue link is invalid or has expired.</p>
            </div>
        );
    }

    // Keep the loading spinner until the domain resolves and data fetches
    if (authLoading || !effectiveCompanyId || (pageIsLoading && allItems.length === 0)) {
        return <div className="flex items-center justify-center h-screen bg-[#E9F0F7]"><Spinner /></div>;
    }

    if (error) {
        return <div className="flex items-center justify-center h-screen bg-[#E9F0F7] text-red-500">{error}</div>;
    }

    return (
        <div className="bg-[#E9F0F7] min-h-screen font-sans text-[#333] flex flex-col relative">

            <LeadPopUp
                companyId={effectiveCompanyId}
                companyName={companyName}
                autoPopup={false}
                forceOpen={forceLeadOpen}
                detailsOnly={!approvalEnabled}
                onLeadSubmit={() => {
                    setIsLeadFilled(true);
                    setForceLeadOpen(false);
                    localStorage.setItem("leadJustSubmitted", "true");

                    const leadData = JSON.parse(
                        localStorage.getItem("leadData") || "{}"
                    );

                    const phone = leadData.number || "";
                    setLeadPhone(phone);
                    // ensure this customer shows up in Approval Requests later if seller enables approval
                    if (effectiveCompanyId) {
                        const cleanNumber = phone.replace(/\D/g, "").trim();
                        if (cleanNumber) {
                            ensurePendingApprovalEntry(effectiveCompanyId, leadData.name || "Guest User", cleanNumber);
                        }
                    }


                    setTimeout(() => {
                        fetchUserNotifyStatus();
                    }, 300);
                    if (pendingCartItem) {          // ← auto-add to cart
                        addToCart(pendingCartItem);
                        setPendingCartItem(null);
                    }
                    if (pendingNotifyItem) {
                        handleNotifyRequest(pendingNotifyItem);
                        setPendingNotifyItem(null);
                    }
                    if (pendingBulkItem) {
                        setBulkQuoteItem(pendingBulkItem);
                        setPendingBulkItem(null);
                    }
                    if (pendingPersonalizationItem) {
                        setPersonalizationItem(pendingPersonalizationItem);
                        setPendingPersonalizationItem(null);
                    }
                }}
            />
            <header className="sticky top-0 bg-white border-b border-gray-100 shadow-sm z-[60]">
                <div className="max-w-7xl mx-auto px-1 md:px-4 py-2 relative">

                    {/* Back Button - Left Side */}
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => navigate(subdomain ? '/' : `/catalogue/${effectiveCompanyId}`)}
                            className="p-2 rounded-sm hover:bg-slate-200 transition-colors text-slate-700"
                            title="Back"
                        >
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="24"
                                height="24"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            >
                                <line x1="19" y1="12" x2="5" y2="12"></line>
                                <polyline points="12 19 5 12 12 5"></polyline>
                            </svg>
                        </button>

                        <span
                            className={`hidden md:block transition-all duration-500 ease-in-out transform ${isScrolled
                                ? "opacity-100 translate-x-0"
                                : "opacity-0 -translate-x-4"
                                } text-[10px] md:text-xs font-semibold text-gray-500 uppercase whitespace-nowrap`}
                        >
                            {companyName}
                        </span>
                    </div>

                    {/* Company Name */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">

                        {/* Company Name - Default (Desktop & Mobile Top) */}
                        <span
                            className={`absolute transition-all duration-500 ease-in-out transform ${isScrolled
                                ? "-translate-y-6 opacity-0 scale-95"
                                : "translate-y-0 opacity-100 scale-100"
                                } text-base md:text-lg font-bold text-[#1A3B5D] uppercase tracking-tight whitespace-nowrap`}
                        >
                            {companyName}
                        </span>

                        {/* Category Name - On Scroll */}
                        <span
                            className={`absolute transition-all duration-500 ease-in-out transform ${isScrolled
                                ? "translate-y-0 opacity-100 scale-100"
                                : "translate-y-6 opacity-0 scale-95"
                                } text-base md:text-lg font-extrabold text-[#F97316] uppercase tracking-tight whitespace-nowrap`}
                        >
                            {currentCategoryName}
                        </span>

                        {/* Company Name Below Category (Mobile Only) */}
                        {isScrolled && (
                            <span className="md:hidden text-[10px] font-semibold text-gray-500 uppercase tracking-wide mt-8">
                                {companyName}
                            </span>
                        )}
                    </div>

                    {/* Cart Button - Right Side */}
                    <div className="absolute right-1 md:right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
                        {/* Personalization Button */}
                        <button
                            onClick={() => {
                                const alreadyFilled = localStorage.getItem('leadSubmitted') === 'true';
                                if (!alreadyFilled) {
                                    setForceLeadOpen(false);
                                    setTimeout(() => setForceLeadOpen(true), 0);
                                    return;
                                }
                                setPersonalizationItem({} as Item);
                                setPersonalizationText('');
                            }}
                            className="flex flex-col items-center justify-center gap-0.5 bg-[#F97316] text-white py-2 px-3 md:px-4 rounded-sm font-black text-[10px] uppercase tracking-wider shadow-md active:scale-95 transition-all md:flex-row md:gap-1.5"
                            title="Send a Query"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                            </svg>
                            <span className="text-[8px] leading-none">Query</span>
                        </button>
                        <button
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation(); // Forces the browser to ONLY click this button
                                if (effectiveCompanyId) {
                                    navigate(subdomain ? '/checkout' : `/checkout/${effectiveCompanyId}`);
                                }
                            }}
                            className="hidden md:flex items-center justify-center gap-2 bg-[#F97316] text-white py-2 px-3 md:px-4 rounded-sm font-black text-[10px] uppercase tracking-wider shadow-md active:scale-95 transition-all relative"
                        >
                            <ShoppingCart size={16} />
                            <span className="hidden md:inline">Cart</span>
                            {cartCount > 0 && (
                                <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[8px] w-4 h-4 rounded-sm flex items-center justify-center border-2 border-white">
                                    {cartCount}
                                </span>
                            )}
                        </button>
                    </div>

                </div>
            </header>

            <main className="p-3 md:p-6 space-y-4 flex-1 max-w-7xl mx-auto w-full pb-24">
                {approvalEnabled && isUserDeclined && (
                    <div className="max-w-7xl mx-auto mb-3 p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-bold rounded-sm text-center">
                        Your request has been declined. Please contact the business.
                    </div>
                )}

                {showNotifySuccess && (
                    <div className="max-w-7xl mx-auto mb-3 p-3 bg-green-50 border border-green-200 text-green-700 text-xs font-bold rounded-sm text-center relative animate-fade-in">
                        You will be notified when item is back in stock
                        <button
                            onClick={() => setShowNotifySuccess(false)}
                            className="absolute right-2 top-2 text-green-600 font-black"
                        >
                            ✕
                        </button>
                    </div>
                )}
                {showPersonalizationSuccess && (
                    <div className="max-w-7xl mx-auto mb-3 p-3 bg-green-50 border border-green-200 text-green-700 text-xs font-bold rounded-sm text-center relative animate-fade-in">
                        ✅ Personalization request submitted! We'll get back to you soon.
                        <button
                            onClick={() => setShowPersonalizationSuccess(false)}
                            className="absolute right-2 top-2 text-green-600 font-black"
                        >
                            ✕
                        </button>
                    </div>
                )}

                {approvalEnabled && isUserPending && (
                    <div className="max-w-7xl mx-auto mb-3 p-3 bg-yellow-50 border border-yellow-200 text-yellow-700 text-xs font-bold rounded-sm text-center">
                        Your request is under review. Prices will be visible after approval.
                    </div>
                )}
                <div
                    className={`flex items-center justify-center transition-all duration-500 ${isScrolled
                        ? "opacity-0 -translate-y-4 h-0 overflow-hidden"
                        : "opacity-100 translate-y-0"
                        }`}
                >
                    <h1 className="text-sm md:text-xl font-extrabold text-[#F97316] uppercase tracking-tighter">
                        {currentCategoryName}
                    </h1>
                </div>

                <div
                    className={`flex justify-center transition-all duration-300 ${isSearchSticky
                        ? "sticky top-[60px] z-50"
                        : "relative"
                        }`}
                >
                    <div className="relative group md:max-w-md w-full">
                        <SearchBar
                            items={allItems}
                            itemGroups={allItemGroups}
                            hideUncategorized={true}
                            hideOutOfStock={catalogueSettings?.hideOutOfStock ?? false}
                            onItemSelected={(item: any) => {
                                setSearchQuery("");
                                setActiveHighlight(null);
                                const group = allItemGroups.find(
                                    g => g.id === item.itemGroupId
                                );
                                const slug = group
                                    ? generateSlug(group.name)
                                    : item.itemGroupId;

                                navigate(
                                    subdomain ? `/${slug}` : `/${effectiveCompanyId}/${slug}`,
                                    {
                                        state: {
                                            highlightItemId: item.id,
                                            trigger: Date.now(),
                                        },
                                    }
                                );
                            }}
                        />
                    </div>
                </div>

                <div className="max-w-7xl mx-auto px-1 flex items-center justify-between relative">
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Total Products:</span>
                        <span className="bg-[#F97316]/10 text-[#F97316] px-2.5 py-0.5 rounded-sm text-[10px] font-black">{filteredItems.length}</span>
                    </div>
                    <div className="relative">
                        <button onClick={() => setIsSortOpen(!isSortOpen)} className="flex items-center gap-2 bg-white border border-gray-100 px-3 py-1.5 rounded-sm shadow-sm active:scale-95 transition-all">
                            <span className="text-[10px] font-black uppercase text-[#1A3B5D]">Sort: {sortOrder}</span>
                            <FiPlus className={`transition-transform duration-300 ${isSortOpen ? 'rotate-45' : ''}`} size={12} />
                        </button>
                        {isSortOpen && (
                            <div className="absolute right-0 mt-2 w-40 bg-white rounded-sm shadow-xl border border-gray-50 z-[70] overflow-hidden">
                                {(['A-Z', 'Z-A', 'Price: Low-High', 'Price: High-Low'] as const).map((opt) => (
                                    <button key={opt} onClick={() => { setSortOrder(opt); setIsSortOpen(false); }} className={`w-full text-left px-4 py-3 text-[10px] font-black uppercase hover:bg-gray-50 border-t border-gray-50 first:border-0 ${sortOrder === opt ? 'text-[#F97316]' : 'text-[#1A3B5D]'}`}>
                                        {opt.replace(':', ': ')}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-0.5">
                    {itemsToDisplay.map((item) => {
                        const cartItem = cart.find(i => i.item.id === item.id);
                        const isActuallyOutOfStock = (item.stock || 0) <= 0;
                        const isOutOfStock =
                            !catalogueSettings?.allowNegativeInventory &&
                            isActuallyOutOfStock;
                        const showNotifyButton =
                            catalogueSettings?.enableOutOfStockNotification && isActuallyOutOfStock;
                        const disableAddToCart = isOutOfStock;
                        const { mrp, salePrice, discountPercent, hasDiscount, hasBothPrices } = getEffectivePriceInfo(item);
                        const showDiscountBadge = !hidePriceEnabled && catalogueSettings?.showDiscountBadge && hasDiscount;
                        return (
                            <div
                                id={item.id}
                                key={item.id}
                                onClick={() => handleOpenDetailDrawer(item)}
                                className={`bg-white rounded-sm overflow-hidden shadow-sm border flex flex-col transition-all duration-300 relative group hover:shadow-md cursor-pointer ${activeHighlight === item.id
                                    ? 'ring-3 ring-[#F97316] scale-110 bg-blue-50 border-[#F97316] z-100'
                                    : pinnedIds.has(item.id!)
                                        ? 'ring-1 ring-[#F97316] shadow-lg border-[#F97316]'
                                        : 'border-gray-100'
                                    }`}
                            >
                                {/* IMAGE */}
                                <div className="aspect-square bg-[#F8FAFC] flex items-center justify-center relative overflow-hidden">
                                    {/* BULK QUOTE BUTTON — top left */}
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            const alreadyFilled = !approvalEnabled || localStorage.getItem('leadSubmitted') === 'true';
                                            if (!alreadyFilled) {
                                                setPendingBulkItem(item);
                                                setForceLeadOpen(false);
                                                setTimeout(() => setForceLeadOpen(true), 0);
                                                return;
                                            }
                                            setBulkQuoteItem(item);
                                        }}
                                        className="absolute bottom-1.5 right-1.5 z-10 bg-[#F97316] text-white text-[8px] font-black uppercase tracking-tight px-1.5 py-1 rounded-sm shadow-md hover:bg-[#F97316] transition-colors"
                                        title="Request Bulk Price"
                                    >
                                        Bulk
                                    </button>
                                    {pinnedIds.has(item.id!) && (
                                        <div className="absolute top-1.5 right-1.5 z-10 bg-white text-[#F97316] rounded-sm px-1 py-1 flex items-center gap-0.5 shadow-md border border-[#F97316]">
                                            <Pin size={12} className="fill-[#F97316]" />
                                        </div>
                                    )}
                                    <ProductCardImage
                                        images={itemSlideImagesMap[item.id!] || (item.imageUrl ? [item.imageUrl] : [])}
                                        alt={item.name}
                                    />
                                    {isOutOfStock && (
                                        <div className="absolute top-2 left-2 bg-orange-500 text-white px-1 py-0.5 rounded-sm text-[10px] font-black uppercase">
                                            Out of Stock
                                        </div>
                                    )}

                                    {/*  DISCOUNT BADGE */}
                                    {showDiscountBadge && (
                                        <div
                                            className={`absolute top-2 ${pinnedIds.has(item.id!) ? "right-8" : "right-2"
                                                } bg-[#F97316] text-white px-2 py-0.5 rounded-sm text-[9px] font-black uppercase tracking-tight shadow-md`}
                                        >
                                            {discountPercent}% OFF
                                        </div>
                                    )}
                                </div>

                                {/* CONTENT */}
                                <div className="p-3 flex flex-col flex-1">
                                    <h3 className="text-[12px] font-black text-[#1A3B5D] mb-1 uppercase leading-tight">
                                        {item.name.slice(0, 50)}
                                    </h3>

                                    {/* PRICE */}
                                    <div className="flex items-center justify-between w-full">
                                        <div className="flex items-center gap-2 w-full">

                                            {/* PRICE (only when allowed) */}
                                            {!hidePriceEnabled && (!approvalEnabled || isUserApproved) && (
                                                <>
                                                    {hasBothPrices ? (
                                                        <div className="flex flex-wrap items-center gap-x-1 leading-tight min-w-0">

                                                            {/* MRP */}
                                                            <p className="text-[14px] font-bold text-gray-400 line-through whitespace-nowrap shrink-0">
                                                                ₹{mrp}
                                                            </p>

                                                            {/* SALE PRICE */}
                                                            <p className="text-[14px] font-black text-[#F97316] whitespace-nowrap shrink-0">
                                                                ₹{salePrice}
                                                            </p>
                                                        </div>
                                                    ) : (
                                                        <p className="text-[14px] font-black text-[#F97316]">
                                                            ₹{salePrice}
                                                        </p>
                                                    )}
                                                </>
                                            )}

                                            {/* UNIT (ALWAYS visible) */}
                                            <span className="text-[12px] text-gray-600 font-semibold">
                                                ({item.unitMultiplier || 1} pcs)
                                            </span>

                                        </div>
                                    </div>

                                    {/* CART AREA */}
                                    <div className="mt-auto flex gap-1">
                                        {cartItem ? (
                                            <div className="w-full flex items-center justify-between bg-gray-50 rounded-sm px-1 py-1 border border-gray-100">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        updateQuantity(item.id!, -1);
                                                    }}
                                                    className="p-1.5 bg-white shadow-sm text-[#F97316] hover:bg-[#F97316] hover:text-white rounded-sm transition-all"
                                                >
                                                    <Minus size={12} strokeWidth={3} />
                                                </button>

                                                <span className="text-xs font-black text-[#1A3B5D]">
                                                    {cartItem.quantity}
                                                </span>

                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        updateQuantity(item.id!, 1);
                                                    }}
                                                    className="p-1.5 bg-white shadow-sm text-[#F97316] hover:bg-[#F97316] hover:text-white rounded-sm transition-all"
                                                >
                                                    <Plus size={12} strokeWidth={3} />
                                                </button>
                                            </div>
                                        ) : showNotifyButton ? (
                                            //  CASE 1: Notify enabled + OOS
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (!notifiedItems[item.id!]) {
                                                        handleNotifyRequest(item);
                                                    }
                                                }}
                                                className={`w-full py-2 rounded-xs text-[9px] font-black uppercase tracking-widest shadow-sm transition-all flex items-center justify-center gap-2 ${notifiedItems[item.id!]
                                                    ? 'bg-green-600 text-white cursor-default'
                                                    : 'bg-orange-400 text-white active:scale-95'
                                                    }`}>
                                                {notifiedItems[item.id!] ? '✓ We will notify you' : '🔔 Notify Me'}
                                            </button>
                                        ) : (
                                            // CASE 2: normal add to cart (may be disabled)
                                            <button
                                                disabled={disableAddToCart}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (disableAddToCart) return;
                                                    const card = e.currentTarget.closest(".group");
                                                    const img = card?.querySelector("img") as HTMLImageElement;
                                                    const fallback = card?.querySelector(".aspect-square") as HTMLElement;
                                                    const sourceEl = img || fallback;
                                                    if (sourceEl) animateToCart(sourceEl);
                                                    addToCart(item);
                                                }}
                                                className={`w-full py-2 rounded-xs text-[12px] font-black uppercase tracking-widest mt-1 shadow-sm transition-all flex items-center justify-center gap-2 ${disableAddToCart
                                                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                                    : 'bg-[#F97316] text-white active:scale-95'
                                                    }`}
                                            >
                                                <Plus size={12} /> Add to Cart
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>
                {hasMoreItems && <div ref={loadMoreRef} className="h-20 flex justify-center items-center"><Spinner /></div>}
            </main>

            <Footer
                companyName={companyName}
                instagram={socialLinks.instagram}
                facebook={socialLinks.facebook}
                twitter={socialLinks.twitter}
                gmail={socialLinks.gmail}
            />

            {/* --- STICKY BOTTOM CART --- */}
            <div
                ref={cartIconRef}
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation(); // Forces the browser to ONLY click this button
                    if (effectiveCompanyId) {
                        navigate(subdomain ? '/checkout' : `/checkout/${effectiveCompanyId}`);
                    }
                }}
                className="fixed bottom-0 left-0 w-full md:w-[50%] md:left-1/2 md:-translate-x-1/2 z-[1000] bg-[#F97316] text-white shadow-lg cursor-pointer active:scale-[0.98] transition-all"
            >
                <div className="max-w-7xl mx-auto flex items-center justify-between px-4 py-3">

                    {/* Left side */}
                    <div className="flex items-center gap-3">

                        <div className="flex flex-col">
                            <span className="text-[12px] font-bold uppercase tracking-wide">
                                {cartCount} Item{cartCount > 1 ? 's' : ''}
                            </span>
                            {!hidePriceEnabled && (!approvalEnabled || isUserApproved) && (
                                <span className="text-[15px] font-bold">
                                    ₹{cartTotal.toFixed(2)}
                                </span>
                            )}

                        </div>


                        <ShoppingCart size={20} />

                    </div>

                    {/* Right side */}
                    <div className="flex items-center gap-2 font-black uppercase text-[12px]">
                        View Cart →
                    </div>

                </div>
            </div>
            {/* BULK QUOTE POPUP */}
            {bulkQuoteItem && effectiveCompanyId && (
                <BulkQuotePopup
                    item={bulkQuoteItem}
                    companyId={effectiveCompanyId}
                    onClose={() => setBulkQuoteItem(null)}
                />
            )}
            {/* PERSONALIZATION POPUP */}
            {personalizationItem && (
                <div
                    className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
                    onClick={() => setPersonalizationItem(null)}
                >
                    <div
                        className="bg-white w-full max-w-md rounded-sm shadow-2xl p-5 space-y-4"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between">
                            <div>
                                <h2 className="text-sm font-black text-[#1A3B5D] uppercase tracking-tight">
                                    Send a Query
                                </h2>
                                <p className="text-[10px] text-gray-400 font-semibold mt-0.5">
                                    Describe what you're looking for
                                </p>
                            </div>
                            <button
                                onClick={() => setPersonalizationItem(null)}
                                className="text-gray-400 hover:text-gray-700 font-black text-lg leading-none"
                            >✕</button>
                        </div>

                        {/* Query description only */}
                        <div>
                            <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 block mb-1">
                                Your Query
                            </label>
                            <textarea
                                rows={5}
                                value={personalizationText}
                                onChange={(e) => setPersonalizationText(e.target.value)}
                                placeholder="e.g. I need a blue hoodie in size L with 'Rahul' printed on it..."
                                className="w-full border border-gray-200 rounded-sm p-3 text-sm text-gray-700 outline-none focus:border-[#1A3B5D] resize-none"
                            />
                        </div>

                        {/* Submit */}
                        <button
                            disabled={!personalizationText.trim()}
                            onClick={() => handlePersonalizationSubmit(personalizationItem, personalizationText)}
                            className={`w-full py-3 rounded-sm text-[12px] font-black uppercase tracking-widest transition-all ${personalizationText.trim()
                                ? 'bg-[#F97316] text-white active:scale-95'
                                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                }`}
                        >
                            Submit Query
                        </button>
                    </div>
                </div>
            )}
            <ItemDetailDrawer
                catalogueSettings={catalogueSettings}
                item={selectedItemForDetails}
                isOpen={isDetailDrawerOpen}
                onClose={() => {
                    setIsDetailDrawerOpen(false);
                    setSelectedItemForDetails(null);
                    // undo the pushState we did on open, so history stack stays clean
                    if (window.history.state?.drawerOpen) {
                        window.history.back();
                    }
                }}
                onAddToCart={addToCart}
                initialQuantity={cart.find(i => i.item.id === selectedItemForDetails?.id)?.quantity || 0}
                isCustomerApproved={isUserApproved}
                onNotifyRequest={handleNotifyRequest}
                notified={selectedItemForDetails ? !!notifiedItems[selectedItemForDetails.id!] : false}
                onRequireLead={() => {
                    setForceLeadOpen(true);
                }}
                onUpdateQuantity={updateQuantity}
                companyId={effectiveCompanyId || ''}
                variantGroupIds={variantGroupIds}
                onVariantSelect={(variantItem) => {
                    setSelectedItemForDetails(variantItem as Item);
                    setVariantGroupIds(resolveVariantGroup(variantItem as Item));
                }}
            />
            {whatsappLink && (
                <a
                    href={whatsappLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="fixed bottom-24 right-4 md:bottom-6 md:right-6 z-[10000] bg-[#25D366] text-white w-12 h-12 rounded-full shadow-lg flex items-center justify-center active:scale-95 transition-all"
                    title="Chat on WhatsApp"
                >
                    <FaWhatsapp size={26} />
                </a>
            )}
        </div>
    );
};

export default SharedProduct;