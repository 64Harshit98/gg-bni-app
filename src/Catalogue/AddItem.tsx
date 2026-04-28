import React, { useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ROUTES } from '../constants/routes.constants';
import { CustomButton } from '../Components';
import { Variant, State } from '../enums';
import BarcodeScanner from '../UseComponents/BarcodeScanner';
import { Spinner } from '../constants/Spinner';
import { Modal } from '../constants/Modal';
import { IconScanCircle } from '../constants/Icons';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../lib/Firebase';
import imageCompression from 'browser-image-compression';

import { useItemForm } from '../Catalogue/hooks/useItemForm';
import { UNIT_OPTIONS, getUnitLabel } from '../Components/itemUnits';
import { formatImageUrl } from '../Components/formatImageUrl';
import UploadProgressModal from '../Components/UploadProgressModal';
import BulkImportPanel from '../Components/BulkImportPanel';

const ItemAdd: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const isActive = (path: string) => location.pathname === path;

  // ── Image state (orange variant only) ───────────────────────────────────
  const [imageUrl,            setImageUrl]           = useState('');
  const [imageFile,           setImageFile]          = useState<File | null>(null);
  const [imagePreview,        setImagePreview]       = useState<string | null>(null);
  const [isImageCompressing,  setIsImageCompressing] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // ── Hook ─────────────────────────────────────────────────────────────────
  const form = useItemForm({
    resolveImageUrl: async (barcode) => {
      if (imageFile) {
        const storageRef = ref(storage, `companies/${barcode}_${Date.now()}`);
        await uploadBytes(storageRef, imageFile);
        return getDownloadURL(storageRef);
      }
      return formatImageUrl(imageUrl) ?? null;
    },
  });

  // ── Image handlers ───────────────────────────────────────────────────────
  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsImageCompressing(true);
    try {
      const compressed = await imageCompression(file, {
        maxSizeMB: 0.5, maxWidthOrHeight: 1024, useWebWorker: true,
      });
      setImageFile(compressed);
      setImagePreview(URL.createObjectURL(compressed));
    } catch {
      form.setModal({ message: 'Failed to compress image.', type: State.ERROR });
    } finally {
      setIsImageCompressing(false);
    }
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview(null);
    if (imageInputRef.current) imageInputRef.current.value = '';
  };

  // Extra form reset for image fields
  const extraReset = () => {
    setImageFile(null);
    setImagePreview(null);
    setImageUrl('');
    if (imageInputRef.current) imageInputRef.current.value = '';
  };

  if (form.pageIsLoading) return <Spinner />;

  const renderHeader = () => (
    <div className="fixed top-0 left-0 right-0 z-10 p-4 bg-gray-100 border-b border-gray-300 flex flex-col md:static md:flex-row md:justify-between md:items-center md:p-3 md:bg-white md:shadow-sm">
      <h1 className="text-2xl font-bold text-gray-800 text-center mb-4 md:mb-0 md:text-left">
        Add Item
      </h1>
      <div className="flex items-center justify-center gap-6">
        <CustomButton variant={Variant.Transparent} onClick={() => navigate(`${ROUTES.CHOME}/${ROUTES.ADD_PRODUCT}`)} active={isActive(`${ROUTES.CHOME}/${ROUTES.ADD_PRODUCT}`)}>Item Add</CustomButton>
        <CustomButton variant={Variant.Transparent} onClick={() => navigate(`${ROUTES.CHOME}/${ROUTES.CAT_ITEM_GROUP}`)} active={isActive(`${ROUTES.CHOME}/${ROUTES.CAT_ITEM_GROUP}`)}>Item Groups</CustomButton>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-screen w-full bg-gray-100 font-poppins text-gray-800 relative">
      <BarcodeScanner
        isOpen={form.isScannerOpen}
        onClose={() => form.setIsScannerOpen(false)}
        onScanSuccess={form.handleBarcodeScanned}
      />
      {form.modal && (
        <Modal message={form.modal.message} onClose={() => form.setModal(null)} type={form.modal.type} />
      )}

      {form.uploadProgress && (
        <UploadProgressModal
          current={form.uploadProgress.current}
          total={form.uploadProgress.total}
          barColorClass="bg-[#F97316]"
        />
      )}

      {renderHeader()}

      <div className="flex-1 flex flex-col md:flex-row relative">

        {/* LEFT PANEL */}
        <div className="flex-1 w-full md:w-[65%] bg-gray-100 md:bg-gray-50 md:border-r border-gray-200 pt-28 pb-24 px-2 md:pt-6 md:px-6 md:pb-6 overflow-y-auto">

          {form.error   && <div className="mb-4 text-center p-3 bg-red-100 text-red-700 rounded-sm">{form.error}</div>}
          {form.success && <div className="mb-4 text-center p-3 bg-green-100 text-green-700 rounded-sm">{form.success}</div>}

          {/* MOBILE BULK IMPORT */}
          <div className="md:hidden bg-white p-2 rounded-sm shadow-md mb-4">
            <div className="flex flex-col items-center justify-center mb-4">
              <h2 className="text-lg font-semibold text-gray-700 mb-2">Bulk Import</h2>
              <input type="file" ref={form.fileInputRef} onChange={(e) => form.handleFileUpload(e)} className="hidden" accept=".xlsx, .xls, .csv" />
              <button
                onClick={() => form.fileInputRef.current?.click()}
                disabled={form.isUploading}
                className="w-full max-w-xs bg-[#F97316] text-white py-2 px-4 rounded-sm hover:bg-[#ea580c] disabled:bg-gray-400 flex items-center justify-center gap-2"
              >
                {form.isUploading ? <Spinner /> : 'Import from Excel'}
              </button>
              <button
                type="button"
                onClick={form.handleDownloadSample}
                disabled={form.isUploading}
                className="w-full max-w-xs bg-white text-[#F97316] border border-[#F97316] py-2 px-4 rounded-sm mt-4 hover:bg-[#F97316]/10"
              >
                Download Sample
              </button>
            </div>
          </div>

          {/* SINGLE ITEM FORM */}
          <div className="bg-white p-6 rounded-sm shadow-md md:mb-0 md:rounded-sm md:shadow-sm md:border md:border-gray-200 mb-10">
            <h2 className="text-lg font-bold text-gray-800 mb-4 md:mb-6 md:border-b md:pb-2">Add a Single Item</h2>

            {/* IMAGE SELECTION */}
            <div className="mb-6 flex flex-col md:flex-row gap-4 items-start">
              <div
                className="w-32 h-32 flex-shrink-0 border-2 border-dashed border-gray-300 rounded-lg overflow-hidden bg-gray-50 flex items-center justify-center relative cursor-pointer hover:bg-gray-100 transition-colors"
                onClick={() => imageInputRef.current?.click()}
              >
                {isImageCompressing ? (
                  <div className="flex flex-col items-center"><Spinner /><span className="text-[10px] mt-2 text-gray-500">Compressing...</span></div>
                ) : imagePreview ? (
                  <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-xs text-gray-400 text-center px-2">Click to add<br />Image</span>
                )}
                <input type="file" accept="image/*" ref={imageInputRef} onChange={handleImageChange} className="hidden" />
              </div>
              <div className="flex-1 w-full space-y-2">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Or paste Image URL</label>
                  <input
                    type="text"
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    disabled={!!imageFile}
                    className="w-full p-3 border border-gray-300 rounded-sm focus:ring-[#F97316] outline-none disabled:bg-gray-100 disabled:text-gray-400"
                    placeholder="https://example.com/image.jpg"
                  />
                </div>
                {imageFile && (
                  <button onClick={removeImage} className="text-xs text-red-500 hover:underline">
                    Remove Selected Image
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1 after:content-['*'] after:ml-0.5 after:text-red-500">Item Name</label>
                <input
                  type="text"
                  value={form.itemName}
                  onChange={(e) => form.setItemName(e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-sm focus:ring-[#F97316] outline-none"
                  placeholder="e.g. Apple"
                />
              </div>

              <div className="w-full">
                <label className="block text-sm font-medium text-gray-600 mb-1">
                  Barcode
                  {form.itemSettings?.requireBarcode && <span className="text-red-500 ml-0.5">*</span>}
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={form.itemBarcode}
                    onChange={(e) => form.setItemBarcode(e.target.value)}
                    className="flex-grow p-3 border border-gray-300 rounded-sm focus:ring-[#F97316] outline-none"
                    placeholder="Scan or Type"
                  />
                  <button type="button" onClick={() => form.setIsScannerOpen(true)} className="bg-gray-700 text-white p-3 rounded-sm">
                    <IconScanCircle width={20} height={20} />
                  </button>
                </div>
                <p className="text-xs text-gray-400 mt-1">This is the next available number. You can change it if needed.</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1 after:content-['*'] after:text-red-500">
                    {`MRP (for ${getUnitLabel(form.itemUnit, form.packetSize)})`}
                  </label>
                  <input
                    type="number"
                    value={form.itemMRP}
                    onWheel={(e) => (e.target as HTMLInputElement).blur()}
                    onChange={(e) => {
                      const newMRP = parseFloat(e.target.value) || 0;
                      const discount = parseFloat(form.itemDiscount) || 0;
                      form.setItemMRP(e.target.value);
                      if (discount > 0) {
                        const salePrice = newMRP - (newMRP * discount / 100);
                        form.setItemSalesPrice(String(Math.round(salePrice * 100) / 100));
                      }
                    }}
                    className="w-full p-3 border border-gray-300 rounded-md focus:ring-[#F97316]"
                    placeholder="0"
                  />
                  <p className="text-[10px] text-gray-400">Required if Sale Price is empty</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">MOQ</label>
                  <input
                    type="number"
                    value={form.moq}
                    onWheel={(e) => (e.target as HTMLInputElement).blur()}
                    onChange={(e) => form.setMoq(e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-sm focus:ring-[#F97316]"
                    placeholder="1"
                  />
                  <p className="text-[10px] text-gray-400">Minimum Item Quantity</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1 after:content-['*'] after:text-red-500">
                    {`Sales Price (for ${getUnitLabel(form.itemUnit, form.packetSize)})`}
                  </label>
                  <input
                    type="number"
                    value={form.itemSalesPrice}
                    onWheel={(e) => (e.target as HTMLInputElement).blur()}
                    onChange={(e) => {
                      const mrp = parseFloat(form.itemMRP) || 0;
                      const num = parseFloat(e.target.value) || 0;
                      form.setItemSalesPrice(mrp > 0 && num > mrp ? String(mrp) : e.target.value);
                    }}
                    className="w-full p-3 border border-gray-300 rounded-sm focus:ring-[#F97316]"
                    placeholder="0"
                  />
                  <p className="text-[10px] text-gray-400">Required if MRP is empty</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Purchase Price {form.itemSettings?.requirePurchasePrice && <span className="text-red-500 ml-0.5">*</span>}
                  </label>
                  <input
                    type="number"
                    value={form.itemPurchasePrice}
                    onChange={(e) => form.setItemPurchasePrice(e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-sm focus:ring-[#F97316]"
                    placeholder="0"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Sale Disc (%) {form.itemSettings?.requireSaleDiscount && <span className="text-red-500 ml-0.5">*</span>}
                  </label>
                  <input
                    type="number"
                    value={form.itemDiscount}
                    onWheel={(e) => (e.target as HTMLInputElement).blur()}
                    onChange={(e) => {
                      const discount = parseFloat(e.target.value) || 0;
                      const mrp = parseFloat(form.itemMRP) || 0;
                      form.setItemDiscount(e.target.value);
                      if (mrp > 0 && discount > 0) {
                        const salePrice = mrp - (mrp * discount / 100);
                        form.setItemSalesPrice(String(Math.round(salePrice * 100) / 100));
                      }
                    }}
                    className="w-full p-3 border border-gray-300 rounded-sm focus:ring-[#F97316]"
                    placeholder="Enter discount"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Purchase Disc (%) {form.itemSettings?.requirePurchaseDiscount && <span className="text-red-500 ml-0.5">*</span>}
                  </label>
                  <input
                    type="number"
                    value={form.PurchaseDiscount}
                    onWheel={(e) => (e.target as HTMLInputElement).blur()}
                    onChange={(e) => form.setPurchaseDiscount(e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-sm focus:ring-[#F97316]"
                    placeholder="0"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Tax (%) {form.itemSettings?.requireTax && <span className="text-red-500 ml-0.5">*</span>}
                  </label>
                  <input
                    type="number"
                    value={form.itemTax}
                    onChange={(e) => form.setItemTax(e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-sm focus:ring-[#F97316]"
                    placeholder="0"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">HSN Code</label>
                  <input
                    type="text"
                    value={form.hsnCode}
                    onChange={(e) => form.setHsnCode(e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-sm focus:ring-[#F97316]"
                    placeholder="e.g. 123456"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Stock</label>
                  <input
                    type="number"
                    value={form.itemAmount}
                    onWheel={(e) => (e.target as HTMLInputElement).blur()}
                    onChange={(e) => form.setItemAmount(e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-sm focus:ring-[#F97316]"
                    placeholder="0"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Restock Level {form.itemSettings?.requireRestockQuantity && <span className="text-red-500 ml-0.5">*</span>}
                  </label>
                  <input
                    type="number"
                    onWheel={(e) => (e.target as HTMLInputElement).blur()}
                    value={form.restockQuantity}
                    onChange={(e) => form.setRestockQuantity(e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-sm focus:ring-[#F97316]"
                    placeholder="0"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Category</label>
                <select
                  value={form.selectedCategory}
                  onChange={(e) => {
                    if (e.target.value === 'ADD_NEW_GROUP') {
                      navigate(`${ROUTES.CHOME}/${ROUTES.CAT_ITEM_GROUP}`);
                    } else {
                      form.setSelectedCategory(e.target.value);
                    }
                  }}
                  className="w-full p-3 border border-gray-300 rounded-sm bg-white focus:ring-[#F97316]"
                >
                  <option value="">uncategorized</option>
                  <option value="ADD_NEW_GROUP" className="font-semibold bg-gray-100">+ Add New Group</option>
                  {form.itemGroups.map(g => <option key={g.id} value={g.id!}>{g.name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Unit</label>
                <div className="flex gap-2">
                  <select
                    value={form.itemUnit}
                    onChange={(e) => {
                      form.setItemUnit(e.target.value);
                      if (e.target.value !== 'pkt') form.setPacketSize('');
                    }}
                    className={`p-3 border border-gray-300 rounded-sm bg-white focus:ring-[#F97316] ${form.itemUnit === 'pkt' ? 'w-1/2' : 'w-full'}`}
                  >
                    {UNIT_OPTIONS.map(unit => <option key={unit.value} value={unit.value}>{unit.label}</option>)}
                  </select>
                  {form.itemUnit === 'pkt' && (
                    <input
                      type="number"
                      value={form.packetSize}
                      onChange={(e) => form.setPacketSize(e.target.value)}
                      className="w-1/2 p-3 border border-gray-300 rounded-sm focus:ring-[#F97316]"
                      placeholder="Qty per pkt"
                      min="1"
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT PANEL — desktop */}
        <div className="hidden md:flex w-[35%] flex-col bg-white h-full relative border-l border-gray-200 shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.05)] z-10">
          <div className="flex-1 p-6 flex flex-col">
            <input type="file" ref={form.fileInputRef} onChange={(e) => form.handleFileUpload(e)} className="hidden" accept=".xlsx, .xls, .csv" />
            <BulkImportPanel
              isUploading={form.isUploading}
              onUploadClick={() => form.fileInputRef.current?.click()}
              onDownloadSample={form.handleDownloadSample}
              cardClass="bg-[#F97316]/10 border border-[#F97316]/20 rounded-xl"
              headingClass="text-[#F97316]"
              subtitleClass="text-[#F97316]"
              uploadBtnClass="bg-white text-[#F97316] border border-sky-200 hover:bg-[#F97316]/10"
              downloadLinkClass="text-[#F97316] hover:text-sky-700"
            />
            <div className="flex-grow" />
            <div className="border-t border-gray-100 pb-10">
              <button
                onClick={() => form.handleAddItem(extraReset)}
                disabled={form.isSaving || form.pageIsLoading || (form.loading && form.itemGroups.length === 0)}
                className="w-full bg-[#F97316] text-white py-4 px-6 rounded-xl text-lg font-bold hover:bg-[#ea580c] disabled:bg-gray-300 flex items-center justify-center gap-2"
              >
                {form.isSaving ? <Spinner /> : 'Add Item'}
              </button>
            </div>
          </div>
        </div>

        {/* MOBILE FIXED FOOTER */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 p-4 bg-gray-100 border-t border-gray-200 z-20 flex justify-center pb-20">
          <button
            onClick={() => form.handleAddItem(extraReset)}
            disabled={form.isSaving || form.pageIsLoading || (form.loading && form.itemGroups.length === 0)}
            className="w-full max-w-sm bg-[#F97316] text-white py-3 px-6 rounded-lg text-lg font-semibold hover:bg-[#F97316] disabled:bg-gray-400 flex items-center justify-center gap-2 shadow-md"
          >
            {form.isSaving ? <Spinner /> : 'Add Item'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ItemAdd;
