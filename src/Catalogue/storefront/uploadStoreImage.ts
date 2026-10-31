import imageCompression from 'browser-image-compression';
import { deleteObject, getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import { storage } from '../../lib/Firebase';

/** Compresses a Store page photo in the browser and uploads it under the shop's storefront folder. */
export const uploadStoreImage = async (companyId: string, sectionId: string, file: File, kind: 'banner' | 'photo' = 'photo') => {
    const compressed = await imageCompression(file, {
        maxSizeMB: kind === 'banner' ? 0.35 : 0.25,
        maxWidthOrHeight: kind === 'banner' ? 1920 : 1280,
        useWebWorker: true,
    });
    const path = `companies/${companyId}/storefront/${sectionId}_${Date.now()}.jpg`;
    const task = uploadBytesResumable(ref(storage, path), compressed, { contentType: compressed.type || 'image/jpeg' });
    await new Promise<void>((resolve, reject) => task.on('state_changed', undefined, reject, () => resolve()));
    return { url: await getDownloadURL(task.snapshot.ref), path };
};

/** Removes photos the owner replaced or deleted (after a successful publish). Missing files are ignored. */
export const deleteStoreImages = async (paths: string[]) => {
    await Promise.all(paths.filter(Boolean).map((p) => deleteObject(ref(storage, p)).catch(() => undefined)));
};
