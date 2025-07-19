import { NavLink, Outlet } from 'react-router-dom';

const MastersLayout = () => {
  const navLinks = [
    { to: '/masters/sales', label: 'Sales' },
    { to: '/masters/sales-return', label: 'Sales Return' },
    { to: '/masters/purchase', label: 'Purchase' },
    { to: '/masters/purchase-return', label: 'Purchase Return' },
    { to: '/masters/item-add', label: 'Add Item' },
    { to: '/masters/item-group', label: 'Item Group' },
    { to: '/masters/user-add', label: 'Add User' },
    { to: '/masters/payment', label: 'Payment' },
  ];

  return (
    <div className="flex flex-col">
      <header className="bg-white shadow-md sticky top-0 z-10">
        <div className="px-4 sm:px-6 lg:px-8">
          <h2 className="text-xl font-bold text-gray-900 py-4">Masters</h2>
        </div>
        <div className="border-b border-gray-200">
          <nav
            className="-mb-px flex space-x-8 overflow-x-auto px-4 sm:px-6 lg:px-8"
            aria-label="Tabs"
          >
            {navLinks.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium ${
                    isActive
                      ? 'border-indigo-500 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                  }`
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="flex-grow p-4 md:p-6 lg:p-8">
        <Outlet />
      </main>
    </div>
  );
};

export default MastersLayout;
