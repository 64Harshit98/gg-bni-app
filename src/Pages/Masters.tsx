// src/Pages/Masters.tsx
import { Link, Outlet, useLocation } from 'react-router-dom';
// IMPORTANT: Correct the import path for Master.css based on your file structure
// From image_d9af3c.png, Master.css is in src/Pages/Master/
import './Masters.css'; // Corrected import path

const Masters = () => {
  const location = useLocation();

  // Determine if we are on a specific master sub-page (e.g., /masters/sales-page-1)
  const isDefaultMastersView = location.pathname === '/masters' || location.pathname === '/masters/';

  return (
    <div className="masters-page-wrapper">
      {/* Top Header */}
      <div className="masters-header">
        <h1 className="masters-title">Masters</h1>
      </div>

      {/* Main Content Area - This will be the scrollable part */}
      <div className="masters-content-area">
        {isDefaultMastersView ? (
          <>
            {/* Display list of master options if no specific sub-page is selected */}
            <Link to="sales-page-1" className="master-option-link">
              <span className="master-option-text">Sales </span>
              <span className="master-option-arrow">→</span>
            </Link>
            <Link to="sales-return-1" className="master-option-link"> {/* Placeholder route */}
                <span className="master-option-text">Sales Return</span>
                <span className="master-option-arrow">→</span>
            </Link>
            <Link to="purchase-page-1" className="master-option-link">
              <span className="master-option-text">Purchase </span>
              <span className="master-option-arrow">→</span>
            </Link>
            <Link to="purchase-return-1" className="master-option-link">
              <span className="master-option-text">Purchase Return</span>
              <span className="master-option-arrow">→</span>
            </Link>
            <Link to="user-add" className="master-option-link">
              <span className="master-option-text">Users (Salesman, Admin)</span>
              <span className="master-option-arrow">→</span>
            </Link>
            <Link to="item-add" className="master-option-link">
              <span className="master-option-text">Items </span>
              <span className="master-option-arrow">→</span>
            </Link>
            <Link to="item-group" className="master-option-link">
              <span className="master-option-text">Items Group</span>
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

export default Masters;