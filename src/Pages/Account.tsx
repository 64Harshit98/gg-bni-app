import './Account.css'; // Make sure this import is present

const Account = () => {
  return (
    <div className="account-page">
      <img
        className="profile-image"
        src="https://i.pravatar.cc/150?img=32"
        alt="Profile"
      />

      <h2 className="profile-name">Ethan Carter</h2>
      <p className="profile-email">ethan.carter@email.com</p>

      <button className="edit-button">Edit Profile</button>

      {/* NEW SECTION: Share your business card */}
      <div className="business-card-section">
        <h2>Share your business card</h2>
        <div className="business-card-templates">
          {/* Template 1 */}
          <div className="template-card">
            <img src="/images/template1.png" alt="Business Card Template 1" /> {/* IMPORTANT: Update image path */}
            <p>Template 1</p>
          </div>
          {/* Template 2 */}
          <div className="template-card">
            <img src="/images/template2.png" alt="Business Card Template 2" /> {/* IMPORTANT: Update image path */}
            <p>Template 2</p>
          </div>
          {/* Add more template cards here if you have more templates */}
          {/*
          <div className="template-card">
            <img src="/images/template3.png" alt="Business Card Template 3" />
            <p>Template 3</p>
          </div>
          */}
        </div>
        <div className="template-actions">
          <button className="share-button">Share</button>
          <button className="view-button">View</button>
        </div>
      </div>
      {/* END NEW SECTION */}

    </div>
  );
};

export default Account;