import { useNavigate } from 'react-router-dom'; // Import useNavigate for redirection

const Account = () => {
  const navigate = useNavigate(); // Initialize useNavigate hook

  // Function to handle logout logic
  const handleLogout = () => {
    // In a real application, you would:
    // 1. Clear user session/token from localStorage or sessionStorage
    // 2. Clear any user-related state in your application (e.g., Redux store)
    // 3. Redirect to the login page (or home page)
    console.log('User logged out.');
    // Example: localStorage.removeItem('authToken');
    navigate('/login'); // Redirect to the login page
  };

  // Function to navigate to the sign-up page 

  // Function to handle edit profile
  const handleEditProfile = () => {
    console.log('Navigating to Edit Profile page or opening modal.');
    // You might navigate to /edit-profile or open a modal here
  };


  return (
    <div className="flex min-h-screen flex-col items-center bg-slate-50 py-8 px-4 text-center">
      <img
        className="mb-4 h-32 w-32 rounded-full object-cover"
        src="https://i.pravatar.cc/150?img=32"
        alt="Profile"
      />

      <h2 className="mb-1 text-2xl font-semibold text-slate-900">
        Ethan Carter
      </h2>
      <p className="mb-8 text-base text-slate-500">ethan.carter@email.com</p>

      {/* Buttons: Edit Profile, Logout, and Sign Up */}
      <div className="mb-12 flex flex-wrap justify-center gap-4"> {/* Added flex-wrap for responsiveness */}
        <button
          onClick={handleEditProfile}
          className="rounded-full bg-slate-200 py-3 px-8 font-semibold text-slate-900 transition hover:bg-slate-300"
        >
          Edit Profile
        </button>
        <button
          onClick={handleLogout}
          className="rounded-full bg-red-500 py-3 px-8 font-semibold text-white transition hover:bg-red-600"
        >
          Logout
        </button>
      </div>

      {/* NEW SECTION: Share your business card */}
      <div className="w-full border-t border-slate-200 pt-8">
        <h2 className="mb-6 text-left text-2xl font-semibold text-slate-800">
          Share your business card
        </h2>
        <div className="mb-8 flex gap-5 overflow-x-auto pb-4">
          {/* Template 1 */}
          <div className="flex-shrink-0 w-56 rounded-lg bg-slate-100 p-4 text-center shadow-sm transition hover:-translate-y-1">
            <img
              src="/images/template1.png"
              alt="Business Card Template 1"
              className="mb-3 block h-auto w-full rounded"
            />
            <p className="font-semibold text-slate-600">Template 1</p>
          </div>
          {/* Template 2 */}
          <div className="flex-shrink-0 w-56 rounded-lg bg-slate-100 p-4 text-center shadow-sm transition hover:-translate-y-1">
            <img
              src="/images/template2.png"
              alt="Business Card Template 2"
              className="mb-3 block h-auto w-full rounded"
            />
            <p className="font-semibold text-slate-600">Template 2</p>
          </div>
        </div>
        <div className="flex justify-end gap-4">
          <button className="rounded-full bg-slate-200 py-3 px-8 font-bold text-slate-800 transition hover:bg-slate-300 hover:-translate-y-0.5">
            Share
          </button>
          <button className="rounded-full bg-blue-600 py-3 px-8 font-bold text-white transition hover:bg-blue-700 hover:-translate-y-0.5">
            View
          </button>
        </div>
      </div>
      {/* END NEW SECTION */}
    </div>
  );
};

export default Account;