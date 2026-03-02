import {
  collection,
  getDocs,
  updateDoc,
  doc
} from "firebase/firestore";
import { db } from "../../lib/Firebase";

export const syncNotifyStock = async (
  companyId: string,
  itemId: string,   //  CHANGE — name → id
  inStock: boolean
) => {
  try {
    const notifyRef = collection(
      db,
      "companies",
      companyId,
      "NotifyRequests"
    );

    const snap = await getDocs(notifyRef);

    const updates: Promise<any>[] = [];

    snap.forEach((docSnap) => {
      const data: any = docSnap.data();

      if (!data.items?.length) return;

      //  items update karo
      const updatedItems = data.items.map((i: any) => {
        if (i.id === itemId) {
          return {
            ...i,
            inStock: inStock,
          };
        }
        return i;
      });

      // ANY item in stock check (card color ke liye)
      const anyAvailable = updatedItems.some(
        (i: any) => i.inStock === true
      );

      updates.push(
        updateDoc(
          doc(db, "companies", companyId, "NotifyRequests", docSnap.id),
          {
            items: updatedItems,
            inStock: anyAvailable, // CARD COLOR DRIVER
            updatedAt: new Date(),
          }
        )
      );
    });

    await Promise.all(updates);
  } catch (err) {
    console.error("syncNotifyStock error:", err);
  }
};