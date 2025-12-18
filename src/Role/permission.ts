import { Permissions } from '../enums';

/**
 * Checks if a user's permission list includes a specific permission.
 * @param userPermissions The array of permissions the user has.
 * @param permissionToCheck The specific permission to check for.
 * @returns true if the permission exists in the array, false otherwise.
 */
export const hasPermission = (
    userPermissions: Permissions[],
    permissionToCheck: Permissions
): boolean => {
    // Ensure the user's permission array is valid before checking it.
    if (!userPermissions || userPermissions.length === 0) {
        return false;
    }

    // Check if the specific permission is included in the user's array.
    return userPermissions.includes(permissionToCheck);
};
// 2. Define all user roles
export type Role = 'Owner' | 'Manager' | 'Salesman';

export const Role = {
    Owner: 'Owner' as 'Owner',
    Manager: 'Manager' as 'Manager',
    Salesman: 'Salesman' as 'Salesman',
};

// KEEP THIS - It defines the shape of your user object
export interface User {
    uid: string;
    name: string;
    role: Role;
    permissions: Permissions[];
    companyId: string;
    Subscription?: {
        pack: string;
        isActive: boolean;
        expiryDate?: Date
    };
}