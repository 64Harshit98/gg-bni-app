import { Link, Outlet, useLocation } from 'react-router-dom';
import {
  AiOutlineHome,
  AiFillBook,
  AiOutlineAppstore,
  AiOutlineFileText,
  AiOutlineUsergroupAdd,
} from 'react-icons/ai';
import './index.css';

const MainLayout = () => {
  const location = useLocation();

  const navItems = [
    { to: '/', icon: <AiOutlineHome size={24} />, label: 'Home' },
    { to: '/journal', icon: <AiFillBook size={24} />, label: 'Journal' },
    { to: '/masters', icon: <AiOutlineAppstore size={24} />, label: 'Masters' },
    { to: '/reports', icon: <AiOutlineFileText size={24} />, label: 'Reports' },
    { to: '/account', icon: <AiOutlineUsergroupAdd size={24} />, label: 'Account' },
  ];

  return (
    <>
      <main style={{ padding: '1rem', paddingBottom: '60px' }}>
        <Outlet />
      </main>

      <nav className="bottom-nav">
        {navItems.map(({ to, icon, label }) => (
          <Link
            key={to}
            to={to}
            className={`nav-link ${location.pathname === to ? 'active' : ''}`}
          >
            <div>{icon}</div>
            <span>{label}</span>
          </Link>
        ))}
      </nav>
    </>
  );
};

export default MainLayout;
