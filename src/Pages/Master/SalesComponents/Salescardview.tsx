import React, {useState} from 'react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../../../constants/routes.constants';
import SearchableItemInput from '../../../UseComponents/SearchIteminput';
import BarcodeScanner from '../../../UseComponents/BarcodeScanner';
import PaymentDrawer from '../../../Components/PaymentDrawer';
import { Modal } from '../../../constants/Modal';
import { State } from '../../../enums';
import { GenericCartGrid } from '../../../Components/CardGrid';
import { GenericBillFooter } from '../../../Components/Footer';
import { IconScanCircle } from '../../../constants/Icons';
import { FiTrash2 } from 'react-icons/fi';
import { ItemEditDrawer } from '../../../Components/ItemDrawer';
import BarcodeLinkModal from '../../../Components/BarcodeLinkModal';
import BillSuccessModal from './Billsuccessmodal';
import SalesHeader from './Salesheader';
import TaxToggle from './Taxtoggle';
import type { SalesViewProps } from './Salesviewprops';

const SalesCardView: React.FC<SalesViewProps> = ({
    // Modal
    modal, setModal,
    // Barcode
    isScannerOpen, setIsScannerOpen,
    isBarcodeLinkModalOpen, barcodeToLink, isLinkingBarcode,
    closeBarcodeLinkModal, handleLinkScannedBarcode, handleBarcodeScanned,
    // Header
    isEditMode, invoiceNumber, onInvoiceNumberChange, invoiceDate, onInvoiceDateChange,
    // Items / cart
    availableItems, cartEntries, itemGroupMap, categories,
    items, handleQuantityChange, handleDeleteItem, handleClearCart,
    addItemToCart,
    // Locks / info
    // Settings
    salesSettings, isCardImageView, hideMrp,
    // Tax
    taxToggleProps,
    // Footer
    footerProps, isFooterExpanded, setIsFooterExpanded,
    // Salesman
    salesmanSelector,
    // Drawer
    isDrawerOpen, setIsDrawerOpen, drawerSharedProps, salesDrawerEditProps,
    // Item edit drawer
    selectedItemForEdit, isItemDrawerOpen, handleCloseEditDrawer, handleSaveSuccess, handleOpenEditDrawer,
    // Bill success
    savedBillData, setSavedBillData, sendingPdf, handleSendWhatsapp,
    // User
    currentUser,
    // Payment
    handleSavePayment,
}) => {
    const navigate = useNavigate();
const [cardSearchQuery, setCardSearchQuery] = useState<string>('');
    return (
        <div className="flex flex-col h-full bg-gray-100 w-full overflow-hidden pb-0">
            {modal && (
                <Modal
                    message={modal.message}
                    onClose={() => setModal(null)}
                    type={modal.type}
                    onConfirm={modal.onConfirm}
                    showConfirmButton={!!modal.onConfirm}
                />
            )}

            <BarcodeScanner
                isOpen={isScannerOpen}
                onClose={() => setIsScannerOpen(false)}
                onScanSuccess={handleBarcodeScanned}
            />

            <BarcodeLinkModal
                isOpen={isBarcodeLinkModalOpen}
                barcode={barcodeToLink}
                items={availableItems}
                isLinking={isLinkingBarcode}
                onClose={closeBarcodeLinkModal}
                onLink={handleLinkScannedBarcode}
            />

            <SalesHeader
                title="Sales"
                hideNav={isEditMode}
                invoiceNumber={invoiceNumber}
                onInvoiceNumberChange={onInvoiceNumberChange}
                invoiceDate={invoiceDate}
                onInvoiceDateChange={onInvoiceDateChange}
            />

            <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
                {/* Left panel */}
                <div className="flex flex-col w-full md:w-3/4 h-full relative min-w-0 border-r border-gray-200 overflow-hidden">
                    {/* Search bar */}
                    <div className="flex-shrink-0 p-2 bg-white border-b pb-3 mb-2 rounded-sm md:mb-0 md:border-r border-gray-200">
                        <div className="flex gap-4 items-end w-full">
                            <div className="flex-grow">
                                <SearchableItemInput
                                    label="Search Item"
                                    placeholder="Search by name or barcode..."
                                    items={availableItems}
                                    onItemSelected={(item) => item && addItemToCart(item)}
                                    onSearchChange={setCardSearchQuery}
                                    isLoading={false}
                                    error={null}
                                    onAddItem={(query) =>
                                        navigate(ROUTES.ITEM_ADD, { state: { prefillName: query } })
                                    }
                                    categories={categories}
                                    itemGroupMap={itemGroupMap}
                                    disableDropdown={true}
                                />
                            </div>
                            <button
                                onClick={() => setIsScannerOpen(true)}
                                className="bg-transparent text-gray-700 p-3 border border-gray-700 rounded-sm font-semibold transition hover:bg-gray-800"
                                title="Scan Barcode"
                            >
                                <IconScanCircle width={20} height={20} />
                            </button>
                        </div>
                    </div>

                    {/* Cart header */}
                    <div className="pt-2 flex-shrink-0 grid grid-cols-3 items-center border-b pb-2 px-2">
                        <div className="justify-self-start">
                            <h3 className="text-gray-700 font-medium">Cart</h3>
                        </div>
                        <div className="justify-self-center w-full flex justify-center">
                            {salesmanSelector}
                        </div>
                        <div className="justify-self-end">
                            {items.length > 0 && (
                                <button
                                    onClick={() =>
                                        setModal({
                                            message: 'Are you sure you want to remove all the items?',
                                            type: State.WARNING,
                                            onConfirm: handleClearCart,
                                        })
                                    }
                                    className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded border border-red-200 flex items-center gap-1"
                                >
                                    <FiTrash2 /> Clear
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Cart grid */}
                    <div className="flex-1 min-h-0 overflow-hidden">
                        <GenericCartGrid
                            items={availableItems}
                            cartEntries={cartEntries}
                            itemGroupMap={itemGroupMap}
                            basePriceKey="salesPrice"
                            externalSearchQuery={cardSearchQuery}
                            settings={{
                                showImages: isCardImageView,
                                hideMrp,
                            }}
                            State={State}
                            setModal={setModal}
                            onAddItem={addItemToCart}
                            onQuantityChange={handleQuantityChange}
                            onDeleteCartEntry={handleDeleteItem}
                            onEditItem={handleOpenEditDrawer}
                            onScanBarcode={() => setIsScannerOpen(true)}
                        />
                    </div>

                    {/* Mobile footer */}
                    <div className="md:hidden">
                        <GenericBillFooter
                            isExpanded={isFooterExpanded}
                            onToggleExpand={() => setIsFooterExpanded(!isFooterExpanded)}
                            {...footerProps}
                        >
                            <TaxToggle {...taxToggleProps} />
                        </GenericBillFooter>
                    </div>
                </div>

                {/* Right bill summary panel — desktop only */}
                <div className="hidden md:flex w-1/4 flex-col bg-white h-full relative border-l border-gray-200 shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.05)] z-10">
                    <div className="flex-1 p-6 flex flex-col justify-end">
                        <div className="mb-6 border-b pb-2 flex items-end justify-between">
                            <h2 className="text-xl font-bold text-gray-800">Bill Summary</h2>
                            <span className="text-xs text-indigo-500 font-semibold">
                                {items.length} Items
                            </span>
                        </div>
                        <TaxToggle {...taxToggleProps} />
                        <GenericBillFooter
                            isExpanded={true}
                            onToggleExpand={() => {}}
                            {...footerProps}
                        />
                    </div>
                </div>
            </div>

            {/* Payment drawer */}
            <PaymentDrawer
                mode="sale"
                isOpen={isDrawerOpen}
                onClose={() => setIsDrawerOpen(false)}
                {...drawerSharedProps}
                onPaymentComplete={handleSavePayment}
                isPartyNameEditable={!isEditMode}
                {...salesDrawerEditProps}
                requireCustomerName={salesSettings?.requireCustomerName}
                requireCustomerMobile={salesSettings?.requireCustomerMobile}
                allowDueBilling={salesSettings?.allowDueBilling ?? false}
            />

            {/* Item edit drawer */}
            <ItemEditDrawer
                item={selectedItemForEdit}
                isOpen={isItemDrawerOpen}
                onClose={handleCloseEditDrawer}
                onSaveSuccess={handleSaveSuccess}
            />

            {/* Bill success modal */}
            {savedBillData && (
                <BillSuccessModal
                    savedBillData={savedBillData}
                    companyId={currentUser?.companyId}
                    sendingPdf={sendingPdf}
                    onClose={() => setSavedBillData(null)}
                    onSendWhatsapp={handleSendWhatsapp}
                />
            )}
        </div>
    );
};

export default SalesCardView;