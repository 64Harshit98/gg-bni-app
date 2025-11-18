import { AiOutlineHome, AiOutlineUsergroupAdd } from 'react-icons/ai';
import { IoDocumentTextOutline } from 'react-icons/io5';
import { ROUTES } from '../constants/routes.constants';

export const CatItems = [
  {
    to: ROUTES.ORDER_DETAILS,
    icon: <IoDocumentTextOutline size={24} />,
    label: 'Orders',
  },
  {
    to: ROUTES.CATALOGUE_HOME,
    icon: <AiOutlineHome size={24} />,
    label: 'Home',
  },
  {
    to: ROUTES.CATALOGUE_ACCOUNT,
    icon: <AiOutlineUsergroupAdd size={24} />,
    label: 'Account',
  },
];
