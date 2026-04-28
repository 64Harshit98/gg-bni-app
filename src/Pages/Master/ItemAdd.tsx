import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ROUTES } from '../../constants/routes.constants';
import { CustomButton } from '../../Components';
import { Variant } from '../../enums';
import BarcodeScanner from '../../UseComponents/BarcodeScanner';
import { Spinner } from '../../constants/Spinner';
import { Modal } from '../../constants/Modal';
import { IconScanCircle } from '../../constants/Icons';
import { InfoTooltip } from '../../Components/InfoToolTip';

import { useItemForm } from '../../Catalogue/hooks/useItemForm'
import { UNIT_OPTIONS } from '../../Components/itemUnits';
import UploadProgressModal from '../../Components/UploadProgressModal';
import BulkImportPanel from '../../Components/BulkImportPanel';

const reqClasses = " after:content-['*'] after:ml-0.5 after:text-red-500";

const ItemAdd: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const isActive = (path: string) => location.pathname === path;

  // This variant uses no image-upload; resolveImageUrl is not needed
  const form = useItemForm();

  if (form.pageIsLoading) return <Spinner />;

  const renderHeader = () => (
    <div className="fixed top-0 left-0 right-0 z-10 p-4 bg-gray-100 border-b border-gray-300 flex flex-col md:static md:flex-row md:justify-between md:items-center md:p-3 md:bg-white md:shadow-sm">
      <h1 className="text-2xl font-bold text-gray-800 text-center mb-4 md:mb-0 md:text-left">
        Add Item
      </h1>
      <div className="flex items-center justify-center gap-6">
        <CustomButton variant={Variant.Transparent} onClick={() => navigate(ROUTES.ITEM_ADD)} active={isActive(ROUTES.ITEM_ADD)}>Item Add</CustomButton>
        <CustomButton variant={Variant.Transparent} onClick={() => navigate(ROUTES.ITEM_GROUP)} active={isActive(ROUTES.ITEM_GROUP)}>Item Groups</CustomButton>
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
          barColorClass="bg-sky-500"
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
              <input type="file" ref={form.fileInputRef} onChange={(e) => form.handleFileUpload(e, { skipFirstRow: true })} className="hidden" accept=".xlsx, .xls, .csv" />
              <button
                onClick={() => form.fileInputRef.current?.click()}
                disabled={form.isUploading}
                className="w-full max-w-xs bg-sky-500 text-white py-2 px-4 rounded-sm hover:bg-sky-600 disabled:bg-gray-400 flex items-center justify-center gap-2"
              >
                {form.isUploading ? <Spinner /> : 'Import from Excel'}
              </button>
              <button
                type="button"
                onClick={form.handleDownloadSample}
                disabled={form.isUploading}
                className="w-full max-w-xs bg-white text-sky-500 border border-sky-500 py-2 px-4 rounded-sm mt-4 hover:bg-sky-50"
              >
                Download Sample
              </button>
            </div>
          </div>

          {/* SINGLE ITEM FORM */}
          <div className="bg-white p-4 rounded-sm shadow-md md:mb-0 md:rounded-sm md:shadow-sm md:border md:border-gray-200 mb-10">
            <h2 className="text-lg font-bold text-gray-800 mb-4 md:mb-6 md:border-b md:pb-2">Add a Single Item</h2>
            <div className="space-y-4">

              <div>
                <div className="flex items-center mb-1">
                  <label className="text-sm font-medium text-gray-600 after:content-['*'] after:ml-0.5 after:text-red-500 mr-2">Item Name</label>
                  <InfoTooltip text="The name of the product being added." />
                </div>
                <input
                  type="text"
                  value={form.itemName}
                  onChange={(e) => form.setItemName(e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-sm focus:ring-sky-500 outline-none"
                  placeholder="e.g. Apple"
                />
              </div>

              <div>
                <div className="flex items-center mb-1">
                  <label className="text-sm font-medium text-gray-600 after:content-['*'] after:ml-0.5 after:text-red-500 mr-2">Barcode</label>
                  <InfoTooltip text="Unique identifier for scanning the product." />
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={form.itemBarcode}
                    onChange={(e) => form.setItemBarcode(e.target.value)}
                    className="flex-grow p-3 border border-gray-300 rounded-sm focus:ring-sky-500 outline-none"
                    placeholder="Scan or Type"
                  />
                  <button type="button" onClick={() => form.setIsScannerOpen(true)} className="bg-gray-700 text-white p-3 rounded-sm">
                    <IconScanCircle width={20} height={20} />
                  </button>
                </div>
                <p className="text-xs text-gray-400 mt-1">This is the next available number. You can change it if needed.</p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="flex items-center mb-1">
                    <label className="text-sm font-medium text-gray-600 mr-2">MRP</label>
                    <InfoTooltip text="Maximum Retail Price printed on the product." />
                  </div>
                  <input
                    type="number"
                    value={form.itemMRP}
                    onChange={(e) => form.setItemMRP(e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-sm focus:ring-sky-500"
                    placeholder="0.00"
                  />
                  <p className="text-[10px] text-gray-400">Required if Sale Price is empty</p>
                </div>

                <div>
                  <div className="flex items-center mb-1">
                    <label className={`text-sm font-medium text-gray-600 ${(form.itemSettings as any)?.requireCategory ? reqClasses : ''} mr-2`}>Category</label>
                    <InfoTooltip text="Group this item belongs to (e.g., Electronics)." />
                  </div>
                  <select
                    value={form.selectedCategory}
                    onChange={(e) => {
                      if (e.target.value === 'ADD_NEW_GROUP') {
                        navigate(ROUTES.ITEM_GROUP);
                      } else {
                        form.setSelectedCategory(e.target.value);
                      }
                    }}
                    className="w-full p-3 border border-gray-300 rounded-sm bg-white focus:ring-sky-500"
                  >
                    <option value="">Uncategorized</option>
                    <option value="ADD_NEW_GROUP" className="font-semibold border border-grey-300 bg-gray-100 hover:bg-gray-200">+ Add New Group</option>
                    {form.itemGroups.map(g => <option key={g.id} value={g.id!}>{g.name}</option>)}
                  </select>
                </div>

                <div>
                  <div className="flex items-center mb-1">
                    <label className="text-sm font-medium text-gray-600 after:content-['*'] after:text-red-500 mr-2">Sales Price</label>
                    <InfoTooltip text="The price you are selling this item for." />
                  </div>
                  <input
                    type="number"
                    value={form.itemSalesPrice}
                    onChange={(e) => form.setItemSalesPrice(e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-sm focus:ring-sky-500"
                    placeholder="0.00"
                  />
                  <p className="text-[10px] text-gray-400">Required if MRP is empty</p>
                </div>

                <div>
                  <div className="flex items-center mb-1">
                    <label className={`text-sm font-medium text-gray-600 ${form.itemSettings?.requirePurchasePrice ? reqClasses : ''} mr-2`}>Purchase Price</label>
                    <InfoTooltip text="The price you paid to acquire this item." />
                  </div>
                  <input
                    type="number"
                    value={form.itemPurchasePrice}
                    onChange={(e) => form.setItemPurchasePrice(e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-sm focus:ring-sky-500"
                    placeholder="0.00"
                  />
                </div>

                <div>
                  <div className="flex items-center mb-1">
                    <label className={`text-sm font-medium text-gray-600 ${form.itemSettings?.requireDiscount ? reqClasses : ''} mr-2`}>Sale Disc (%)</label>
                    <InfoTooltip text="Default discount percentage given to customers." />
                  </div>
                  <input
                    type="number"
                    value={form.itemDiscount}
                    onChange={(e) => form.setItemDiscount(e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-sm focus:ring-sky-500"
                    placeholder="0"
                  />
                </div>

                <div>
                  <div className="flex items-center mb-1">
                    <label className="text-sm font-medium text-gray-600 mr-2">Purchase Disc (%)</label>
                    <InfoTooltip text="Discount percentage received from the supplier." />
                  </div>
                  <input
                    type="number"
                    value={form.PurchaseDiscount}
                    onChange={(e) => form.setPurchaseDiscount(e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-sm focus:ring-sky-500"
                    placeholder="0"
                  />
                </div>

                <div>
                  <div className="flex items-center mb-1">
                    <label className={`text-sm font-medium text-gray-600 ${form.itemSettings?.requireTax ? reqClasses : ''} mr-2`}>Tax (%)</label>
                    <InfoTooltip text="Applicable tax percentage for this item." />
                  </div>
                  <input
                    type="number"
                    value={form.itemTax}
                    onChange={(e) => form.setItemTax(e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-sm focus:ring-sky-500"
                    placeholder="0"
                  />
                </div>

                <div>
                  <div className="flex items-center mb-1">
                    <label className="text-sm font-medium text-gray-600 mr-2">HSN Code</label>
                    <InfoTooltip text="Harmonized System Nomenclature code for taxation." />
                  </div>
                  <input
                    type="text"
                    value={form.hsnCode}
                    onChange={(e) => form.setHsnCode(e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-sm focus:ring-sky-500"
                    placeholder="e.g. 123456"
                  />
                </div>

                <div>
                  <div className="flex items-center mb-1">
                    <label className="text-sm font-medium text-gray-600 mr-2">Stock</label>
                    <InfoTooltip text="Current available quantity in your inventory." />
                  </div>
                  <input
                    type="number"
                    value={form.itemAmount}
                    onChange={(e) => form.setItemAmount(e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-sm focus:ring-sky-500"
                    placeholder="0"
                  />
                </div>

                <div>
                  <div className="flex items-center mb-1">
                    <label className={`text-sm font-medium text-gray-600 ${form.itemSettings?.requireRestockQuantity ? reqClasses : ''} mr-2`}>Restock Level</label>
                    <InfoTooltip text="Minimum stock level to trigger a reorder alert." />
                  </div>
                  <input
                    type="number"
                    value={form.restockQuantity}
                    onChange={(e) => form.setRestockQuantity(e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-sm focus:ring-sky-500"
                    placeholder="0"
                  />
                </div>
              </div>

              <div>
                <div className="mb-1">
                  <div className="flex items-center">
                    <label className={`text-sm font-medium text-gray-600 ${(form.itemSettings as any)?.requireUnit ? reqClasses : ''} mr-2`}>Unit</label>
                    <InfoTooltip text="Measurement unit (e.g., pieces, box, kg)." />
                  </div>
                  <p className="text-[10px] text-gray-500 mt-0.5">
                    (Number of items to be added per single stock unit. E.g. 1 for pcs, 10 for box, etc.)
                  </p>
                </div>
                <div className="flex gap-2">
                  <select
                    value={form.itemUnit}
                    onChange={(e) => {
                      form.setItemUnit(e.target.value);
                      if (e.target.value !== 'pkt') form.setPacketSize('');
                    }}
                    className={`p-3 border border-gray-300 rounded-sm bg-white focus:ring-sky-500 ${form.itemUnit === 'pkt' ? 'w-1/2' : 'w-full'}`}
                  >
                    {UNIT_OPTIONS.map(unit => (
                      <option key={unit.value} value={unit.value} disabled={unit.value === ''}>
                        {unit.label}
                      </option>
                    ))}
                  </select>
                  {form.itemUnit === 'pkt' && (
                    <input
                      type="number"
                      value={form.packetSize}
                      onChange={(e) => form.setPacketSize(e.target.value)}
                      className="w-1/2 p-3 border border-gray-300 rounded-sm focus:ring-sky-500"
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
            <input type="file" ref={form.fileInputRef} onChange={(e) => form.handleFileUpload(e, { skipFirstRow: true })} className="hidden" accept=".xlsx, .xls, .csv" />
            <BulkImportPanel
              isUploading={form.isUploading}
              onUploadClick={() => form.fileInputRef.current?.click()}
              onDownloadSample={form.handleDownloadSample}
              cardClass="bg-sky-50 border border-sky-100 rounded-sm"
              headingClass="text-sky-800"
              subtitleClass="text-sky-600"
              uploadBtnClass="bg-white text-sky-600 border border-sky-200 hover:bg-sky-50"
              downloadLinkClass="text-sky-500 hover:text-sky-700"
            />
            <div className="flex-grow" />
            <div className="border-t border-gray-100 pb-10">
              <button
                onClick={() => form.handleAddItem()}
                disabled={form.isSaving || form.pageIsLoading || (form.loading && form.itemGroups.length === 0)}
                className="w-full bg-sky-600 text-white py-4 px-6 rounded-sm text-lg font-bold hover:bg-sky-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-sky-200 transition-all active:scale-[0.98]"
              >
                {form.isSaving ? <Spinner /> : 'Add Item'}
              </button>
            </div>
          </div>
        </div>

        {/* MOBILE FIXED FOOTER */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 p-4 bg-transparent flex justify-center pb-18">
          <button
            onClick={() => form.handleAddItem()}
            disabled={form.isSaving || form.pageIsLoading || (form.loading && form.itemGroups.length === 0)}
            className="w-48 max-w-sm bg-sky-500 text-white py-3 px-6 rounded-sm text-lg font-semibold hover:bg-sky-600 disabled:bg-gray-400 flex items-center justify-center gap-2 shadow-md"
          >
            {form.isSaving ? <Spinner /> : 'Add Item'}
          </button>
        </div>

      </div>
    </div>
  );
};

export default ItemAdd;
