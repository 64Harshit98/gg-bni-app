// src/Pages/Masters.tsx
import { Link, Outlet, useLocation } from 'react-router-dom';
// IMPORTANT: Correct the import path for Master.css based on your file structure
// From image_d9af3c.png, Master.css is in src/Pages/Master/
import './Masters.css'; // Corrected import path
import { ROUTES } from '../constants/routes.constants';
const Reports = () => {
  const location = useLocation();

  // Determine if we are on a specific master sub-page (e.g., /masters/sales-page-1)
  const isDefaultReportsView = location.pathname === '/reports' || location.pathname === '/reports/';

  return (
    <div className="masters-page-wrapper">
      {/* Top Header */}
      <div className="masters-header">
        <h1 className="masters-title">Reports</h1>
      </div>

      {/* Main Content Area - This will be the scrollable part */}
      <div className="masters-content-area">
        {isDefaultReportsView ? (
          <>
            {/* Display list of master options if no specific sub-page is selected */}
            <Link to={ROUTES.ITEM_REPORT} className="master-option-link">
              <span className="master-option-text">Item Report </span>
              <span className="master-option-arrow">→</span>
            </Link>
            <Link to={`${ROUTES.REPORTS}/${ROUTES.SALES_REPORT}`} className="master-option-link">
              <span className="master-option-text">Sales Report </span>
              <span className="master-option-arrow">→</span>
            </Link>
            </>
        ) : (
          // Render nested route content (e.g., Sales Page 1, Purchase)
          <div className="masters-outlet-content">
            <Outlet />
          </div>
        )}
      </div>

      {/* The bottom navigation bar is assumed to be a global component
          rendered outside of this Masters component, typically in your main App.tsx
          or a Layout component.
      */}
    </div>
  );
};

export default Reports;