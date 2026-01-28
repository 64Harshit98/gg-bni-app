import {
    AiOutlineHome,
    AiOutlineUsergroupAdd,
} from 'react-icons/ai';
import { IoDocumentTextOutline } from 'react-icons/io5';
import { ROUTES } from '../constants/routes.constants';

export const CatItems = [
    { to: ROUTES.ORDERDETAILS, icon: <IoDocumentTextOutline size={24} />, label: 'Orders' },
    { to: ROUTES.CHOME, icon: <AiOutlineHome size={24} />, label: 'Home' },
    {
        to: ROUTES.CATALOGUE_ACCOUNTS,
        icon: <AiOutlineUsergroupAdd size={24} />,
        label: 'Account',
    },
];
// Catalouge Routes