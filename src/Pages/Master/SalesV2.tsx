import SearchableDebouncedInput from '../../UseComponents/SearchableDebouncedInput';
import { useDatabase } from '../../context/auth-context';
import type { Item } from '../../constants/models';

const SalesV2 = () => {
  const dbOperations = useDatabase();

  const handleSearch = async (query: string): Promise<Item[]> => {
    if (!dbOperations) return [];
    try {
      return await dbOperations.searchItems(query);
    } catch (err) {
      console.error('Search failed:', err);
      return [];
    }
  };

  const handleItemSelected = (item: Item) => {
    console.log('Selected item:', item);
  };

  return (
    <div className="flex flex-col h-full bg-gray-100 w-full overflow-hidden pb-2">
      <div className="flex flex-col md:flex-row md:justify-between md:items-center bg-gray-100 md:bg-white border-b border-gray-200 shadow-sm flex-shrink-0 mb-2 md:mb-0 p-2 md:px-4 md:py-3">
        <h1 className="text-2xl font-bold text-gray-800 text-center md:text-left mb-2 md:mb-0">
          Sales
        </h1>
        <div className="flex items-center justify-center gap-6 mb-2 md:mb-0">
          <button className="text-gray-600 hover:text-gray-800">Sales</button>
          <button className="text-gray-600 hover:text-gray-800">
            Sales Return
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        <div className="flex flex-col w-full md:w-3/4 min-w-0 h-full relative">
          <div className="flex-shrink-0 p-2 bg-white border-b pb-3 mb-2 rounded-sm md:mb-0 md:border-r border-gray-200">
            <div className="flex gap-4 items-end w-full">
              <div className="flex-grow">
                <SearchableDebouncedInput
                  placeholder="Search by name or barcode..."
                  onSearch={handleSearch}
                  onItemSelected={handleItemSelected}
                />
              </div>
              <button
                className="bg-transparent text-gray-700 p-3 border border-gray-700 rounded-md font-semibold transition hover:bg-gray-800"
                title="Scan Barcode"
              >
                Scan
              </button>
            </div>
          </div>

          <div className="flex-1 flex flex-col bg-gray-100 overflow-y-hidden md:border-r border-gray-200">
            <div className="pt-2 flex-shrink-0 grid grid-cols-3 items-center border-b pb-2 px-2">
              <div className="justify-self-start">
                <h3 className="text-gray-700 font-medium">Cart</h3>
              </div>
              <div className="justify-self-center w-full flex justify-center">
                <select className="p-1 border rounded text-sm">
                  <option value="">Salesman</option>
                </select>
              </div>
              <div className="justify-self-end">
                <button className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded border border-red-200 flex items-center gap-1">
                  Clear
                </button>
              </div>
            </div>
            <div className="flex-shrink-0 grid grid-cols-2 px-2">
              {/* Discount and price info */}
            </div>
            {/* Cart items would go here */}
            <div className="md:hidden">{/* Mobile footer */}</div>
          </div>
        </div>

        <div className="hidden md:flex w-1/4 flex-col bg-white h-full relative border-l border-gray-200 shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.05)] z-10">
          <div className="flex-1 p-6 flex flex-col justify-end">
            <h2 className="text-xl font-bold text-gray-800 mb-6 border-b pb-2">
              Bill Summary
            </h2>
            {/* Bill footer */}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SalesV2;
