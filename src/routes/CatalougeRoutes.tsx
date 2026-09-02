import {
    AiOutlineHome,
    AiOutlineUsergroupAdd,
    AiOutlineBarChart,
} from 'react-icons/ai';
import { IoDocumentTextOutline } from 'react-icons/io5';
import { ROUTES } from '../constants/routes.constants';
import { Cata_Permissions } from '../Catalogue/enum/cata_permissions.enum';

export const CatItems = [
    { to: ROUTES.ORDERDETAILS, icon: <IoDocumentTextOutline size={24} />, label: 'Orders' },
    { to: ROUTES.CHOME, icon: <AiOutlineHome size={24} />, label: 'Home' },
    {
        to: ROUTES.CATALOGUE_ACCOUNTS,
        icon: <AiOutlineUsergroupAdd size={24} />,
        label: 'Account',
    },
];

// Order for the mobile bottom nav: Home, Orders, [Add button], Reports, Account
export const CatMobileNavItems = [
    { to: ROUTES.CHOME, icon: <AiOutlineHome size={24} />, label: 'Home' },
    { to: ROUTES.ORDERDETAILS, icon: <IoDocumentTextOutline size={24} />, label: 'Orders' },
    {
        to: `${ROUTES.CHOME}/${ROUTES.CATALOGUE_REPORTS}`,
        icon: <AiOutlineBarChart size={24} />,
        label: 'Reports',
        permission: Cata_Permissions.ViewReports,
    },
    {
        to: ROUTES.CATALOGUE_ACCOUNTS,
        icon: <AiOutlineUsergroupAdd size={24} />,
        label: 'Account',
    },
];
// Catalouge Routes