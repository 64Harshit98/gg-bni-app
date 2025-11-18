import { AiOutlineHome, AiOutlineUsergroupAdd } from 'react-icons/ai';
import { IoDocumentTextOutline } from 'react-icons/io5';
// import { ICONS } from '../..`/../constants/icon.constants';
import { ROUTES } from '../constants/routes.constants';
// import { CustomIcon } from '../Components';

export const navItems = [
  {
    to: ROUTES.JOURNAL,
    icon: <IoDocumentTextOutline size={24} />,
    label: 'Transactions',
  },
  { to: ROUTES.HOME, icon: <AiOutlineHome size={24} />, label: 'Home' },
  {
    to: ROUTES.ACCOUNT,
    icon: <AiOutlineUsergroupAdd size={24} />,
    label: 'Account',
  },
];
