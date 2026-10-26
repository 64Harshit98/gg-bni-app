import { useCallback, useEffect, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from './Firebase';
import type { AddOnGroup, AddOnOption } from '../constants/models';

/** Saved add-on group (Firestore doc) -> AddOnGroup. id = doc id. */
export const fromTemplateDoc = (id: string, data: any): AddOnGroup => ({
  id,
  name: data?.name || '',
  multiple: data?.multiple !== false,
    maxSelect: Number(data?.maxSelect) || 0,
  extraPrice: data?.extraPrice != null ? Number(data.extraPrice) : undefined,
  options: (data?.options || []) as AddOnOption[],
});

// Firestore rejects undefined, so only linked options carry itemId / itemQty
const cleanOption = (o: AddOnOption): AddOnOption => ({
  id: o.id,
  name: o.name.trim(),
  price: Number(o.price) || 0,
    ...(o.itemId ? { itemId: o.itemId, itemQty: Number(o.itemQty) || 1, syncPrice: !!o.syncPrice } : {}),
});

// The company's add-on library. Pass undefined to skip loading.
export const useAddOnTemplates = (companyId?: string) => {
  const [templates, setTemplates] = useState<AddOnGroup[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!companyId) { setTemplates([]); setLoaded(false); return; }
    try {
      const snap = await getDocs(collection(db, 'companies', companyId, 'addOnTemplates'));
      setTemplates(snap.docs.map((d) => fromTemplateDoc(d.id, d.data())).sort((a, b) => a.name.localeCompare(b.name)));
      setLoaded(true);
    } catch (err) {
      console.error('Failed to load add-on groups:', err);
    }
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  // A group whose id is already saved is updated; anything else is created
  const saveTemplate = async (group: AddOnGroup) => {
    if (!companyId) throw new Error('No company');
    const payload = {
      name: group.name.trim(),
      multiple: group.multiple,
            maxSelect: group.multiple ? Number(group.maxSelect) || 0 : 0,
      // Firestore rejects undefined, so "not allowed" is saved as null
      extraPrice: group.multiple && Number(group.maxSelect) > 0 && group.extraPrice != null ? Number(group.extraPrice) || 0 : null,
      options: group.options.map(cleanOption),
      updatedAt: serverTimestamp(),
    };
    if (templates.some((t) => t.id === group.id)) {
      await setDoc(doc(db, 'companies', companyId, 'addOnTemplates', group.id), payload);
    } else {
      await addDoc(collection(db, 'companies', companyId, 'addOnTemplates'), payload);
    }
    await load();
  };

  const deleteTemplate = async (templateId: string) => {
    if (!companyId) throw new Error('No company');
    await deleteDoc(doc(db, 'companies', companyId, 'addOnTemplates', templateId));
    await load();
  };

  return { templates, loaded, saveTemplate, deleteTemplate };
};