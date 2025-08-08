import {
  AiOutlineHome,
  AiFillBook,
  AiOutlineAppstore,
  // AiOutlineFileText,
  AiOutlineUsergroupAdd,
} from 'react-icons/ai';

import { ROUTES } from '../constants/routes.constants';

export const navItems = [
  { to: ROUTES.HOME, icon: <AiOutlineHome size={24} />, label: 'Home' },
  { to: ROUTES.JOURNAL, icon: <AiFillBook size={24} />, label: 'Transaction' },
  {
    to: ROUTES.MASTERS,
    icon: <AiOutlineAppstore size={24} />,
    label: 'Masters',
  },
  // {
  //   to: ROUTES.REPORTS,
  //   icon: <AiOutlineFileText size={24} />,
  //   label: 'Reports',
  // },
  {
    to: ROUTES.ACCOUNT,
    icon: <AiOutlineUsergroupAdd size={24} />,
    label: 'Account',
  },
];
