import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
} from 'firebase/firestore';

import { db } from '../lib/Firebase';
import type { DashboardData, SmartMetric } from '../features/dashboard/dashboard.types';

const cleanString = (str: string) => {
  if (!str) return 'N/A';
  return str
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
};

const parseNum = (val: unknown): number => {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return val;
  const clean = String(val).replace(/,/g, '').replace(/[^0-9.-]+/g, '');
  return Number(clean) || 0;
};

const getSafeDate = (val: unknown): Date | null => {
  if (!val) return null;
  const v = val as { toDate?: () => Date; seconds?: number };
  if (v.toDate) return v.toDate();
  if (v.seconds) return new Date(v.seconds * 1000);
  if (typeof val === 'string' || typeof val === 'number') return new Date(val);
  return null;
};

type Bucket = { amount: number; count: number; latestName?: string };

/**
 * Computes dashboard metrics for a company over a date range. The aggregation
 * is a verbatim port of the previous in-component logic (sales collection,
 * previous-period comparison, salesperson attribution, payment reconciliation).
 */
export async function fetchDashboard(
  companyId: string,
  startDate: string,
  endDate: string,
): Promise<DashboardData> {
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);
  const duration = end.getTime() - start.getTime();
  const prevEnd = new Date(start.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - duration);

  const salesRef = collection(db, 'companies', companyId, 'sales');
  const usersRef = collection(db, 'companies', companyId, 'users');
  const qSales = query(
    salesRef,
    where('createdAt', '>=', prevStart),
    where('createdAt', '<=', end),
    orderBy('createdAt', 'desc'),
  );
  const [snapSales, snapUsers] = await Promise.all([
    getDocs(qSales),
    getDocs(usersRef),
  ]);

  const currentSalesMap: Record<string, { amount: number; count: number }> = {};
  const paymentMap: Record<string, Bucket> = {};
  const itemMap: Record<string, Bucket> = {};
  const customerMap: Record<string, Bucket> = {};
  const salesmanMap: Record<string, Bucket> = {};
  let currentTotalSales = 0,
    currentOrderCount = 0,
    prevTotalSales = 0;

  const validSalesmen = new Map<string, string>();
  snapUsers.docs.forEach((doc) => {
    const u = doc.data();
    const role = String(u.role || '').toLowerCase().trim();
    const isSalesRole =
      role.includes('sales') ||
      role === 'salesman' ||
      role === 'sales person' ||
      role === 'manager';
    if (!isSalesRole) return;

    // Grab the best available display name
    const displayName =
      u.name || u.fullName || u.displayName || u.username || u.userName || 'Unknown Salesperson';

    // Map the Document ID (the "gibberish") to the display name
    validSalesmen.set(doc.id, displayName);

    // Also map name variations just in case the sales doc stores names directly
    const possibleNames = [u.name, u.fullName, u.displayName, u.username, u.userName]
      .map((n) => String(n || '').trim().toLowerCase())
      .filter(Boolean);

    possibleNames.forEach((name: string) => validSalesmen.set(name, displayName));
  });

  snapSales.docs.forEach((doc) => {
    const d = doc.data();
    const saleDate = getSafeDate(d.createdAt);
    if (!saleDate) return;
    const amount = parseNum(d.totalAmount || d.total || d.amount || d.grandTotal || 0);
    const offset = saleDate.getTimezoneOffset() * 60000;
    const dateKey = new Date(saleDate.getTime() - offset).toISOString().split('T')[0];
    if (!currentSalesMap[dateKey]) currentSalesMap[dateKey] = { amount: 0, count: 0 };
    currentSalesMap[dateKey].amount += amount;
    currentSalesMap[dateKey].count++;

    if (saleDate >= start && saleDate <= end) {
      currentTotalSales += amount;
      currentOrderCount++;
      if (d.paymentMethods && typeof d.paymentMethods === 'object') {
        const methods = Object.entries(d.paymentMethods)
          .map(([key, val]) => ({ key: cleanString(key), amt: parseNum(val) }))
          .filter((m) => m.amt > 0);
        if (methods.length > 0) {
          const totalTendered = methods.reduce((sum, m) => sum + m.amt, 0);
          let change = totalTendered > amount ? totalTendered - amount : 0;
          methods.forEach((m) => {
            let finalAmt = m.amt;
            if (change > 0 && m.key.toLowerCase() === 'cash') {
              const deduct = Math.min(finalAmt, change);
              finalAmt -= deduct;
              change -= deduct;
            }
            if (change > 0) {
              const deduct = Math.min(finalAmt, change);
              finalAmt -= deduct;
              change -= deduct;
            }
            if (finalAmt > 0) {
              if (!paymentMap[m.key]) paymentMap[m.key] = { amount: 0, count: 0 };
              paymentMap[m.key].amount += finalAmt;
              paymentMap[m.key].count++;
            }
          });
        }
      }
      let cust = d.partyName || d.customerName || d.customer || 'N/A';
      if (typeof cust === 'object' && cust.name) cust = cust.name;
      if (!customerMap[cust]) customerMap[cust] = { amount: 0, count: 0 };
      customerMap[cust].amount += amount;
      customerMap[cust].count++;

      let sm = d.salesmanName || d.salesman || d.salesmanId || 'Admin';
      if (typeof sm === 'object' && sm.name) sm = sm.name;

      const smStr = String(sm);
      // Translate the ID (or Name) into the official Display Name
      const resolvedName =
        validSalesmen.get(smStr) || validSalesmen.get(smStr.toLowerCase().trim());

      // Strictly filter: Only track if they have the salesman role
      if (resolvedName) {
        if (!salesmanMap[resolvedName]) salesmanMap[resolvedName] = { amount: 0, count: 0 };
        salesmanMap[resolvedName].amount += amount;
        salesmanMap[resolvedName].count++;
      }

      if (Array.isArray(d.items)) {
        d.items.forEach((item) => {
          const name = item.name || item.itemName;
          const id = item.id || item.itemId || item.sku || name;
          if (id && name) {
            const qty = parseNum(item.quantity || item.qty || 1);
            let val = parseNum(item.finalPrice || item.totalAmount || item.total || item.amount);
            if (val === 0) {
              const price = parseNum(
                item.mrp || item.price || item.rate || item.sellingPrice || 0,
              );
              val = price * qty;
            }
            if (!itemMap[id]) itemMap[id] = { amount: 0, count: 0, latestName: name };
            itemMap[id].amount += val;
            itemMap[id].count += qty;
          }
        });
      }
    }
    if (saleDate >= prevStart && saleDate <= prevEnd) prevTotalSales += amount;
  });

  let percentageChange = 0;
  if (prevTotalSales > 0)
    percentageChange = ((currentTotalSales - prevTotalSales) / prevTotalSales) * 100;
  else if (currentTotalSales > 0) percentageChange = 100;

  const chartData: DashboardData['salesByDate'] = [];

  const itr = new Date(start);
  itr.setDate(itr.getDate() - 1);

  while (itr <= end) {
    const offset = itr.getTimezoneOffset() * 60000;
    const key = new Date(itr.getTime() - offset).toISOString().split('T')[0];
    const label = itr.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' });

    const countVal = currentSalesMap[key]?.count || 0;

    chartData.push({
      name: label,
      sales: currentSalesMap[key]?.amount || 0,
      count: countVal,
      // Pass all possible variations of the count key to ensure the chart reads it
      quantity: countVal,
      qty: countVal,
      bills: countVal,
      Bills: countVal,
      previousSales: 0,
    });

    itr.setDate(itr.getDate() + 1);
  }

  const toList = (map: Record<string, Bucket>): SmartMetric[] =>
    Object.entries(map)
      .map(([key, v]) => ({ name: v.latestName ?? key, amount: v.amount, quantity: v.count }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);

  const topSalesmen: SmartMetric[] = Object.entries(salesmanMap)
    .map(([name, v]) => ({ name, amount: v.amount, quantity: v.count }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  return {
    totalSales: currentTotalSales,
    totalOrders: currentOrderCount,
    percentageChange,
    salesByDate: chartData,
    paymentMethods: toList(paymentMap),
    topItems: toList(itemMap),
    topCustomers: toList(customerMap),
    topSalesmen,
    lastUpdated: Date.now(),
    cacheStart: startDate,
    cacheEnd: endDate,
  };
}
