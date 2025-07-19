// src/Pages/Home.tsx
import './Home.css'; // Import the CSS for the Home page

const Home = () => {
  return (
    <div className="home-page-wrapper">
      {/* Top Bar - You might want a consistent header across pages,
          but for now, a simple title for Home. */}
      <div className="home-header">
        <h1 className="home-title">Dashboard</h1>
      </div>

      {/* Main Content Area */}
      <div className="home-content-area">
        <p className="welcome-message">Welcome </p>
        <div className="dashboard-card">
          <h3>Quick Stats</h3>
          <p>Total Sales Today: ₹1,250.00</p>
          <p>New Orders: 15</p>
          <p>Pending Tasks: 3</p>
        </div>
        <div className="dashboard-card">
          <h3>Recent Activity</h3>
          <ul>
            <li>New Sale: John Doe - ₹125.00</li>
            <li>Item Added: "New Gadget"</li>
            <li>User Login: Admin</li>
          </ul>
        </div>
        {/* Add more dashboard-like content here */}
      </div>

      {/* Note: The bottom navigation bar is assumed to be a global component
          rendered outside of this Home component, typically in your main App.tsx
          or a Layout component.
      */}
    </div>
  );
};

export default Home;