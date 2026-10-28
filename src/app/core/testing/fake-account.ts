import { CurrentAccount } from '../../shared/models/account.model';
import { TenantRole } from '../../shared/models/auth.model';

// Solo para tests. Una cuenta como la que devolvería GET /account/me. Las listas de permisos de cada
// rol están escritas aquí A MANO y solo sirven para que los tests tengan un rol creíble: el código de
// la aplicación NO las usa (los permisos reales los dice la API). Si el backend cambia la tabla, lo
// que importa es que la aplicación obedezca a la API, no que estas listas coincidan.
const OWNER = ['Account.CloseSessions', 'Account.Read', 'Customers.Delete', 'Customers.Read', 'Customers.Write', 'Jobs.Assign', 'Jobs.Cancel', 'Jobs.Execute', 'Jobs.Read', 'Jobs.Write', 'Mfa.Manage', 'Users.Manage', 'Users.Read'];

export const PERMISSIONS_OF: Readonly<Record<TenantRole, string[]>> = {
    Owner: OWNER,
    Admin: OWNER,
    Manager: ['Account.CloseSessions', 'Account.Read', 'Customers.Read', 'Customers.Write', 'Jobs.Assign', 'Jobs.Cancel', 'Jobs.Execute', 'Jobs.Read', 'Jobs.Write', 'Mfa.Manage', 'Users.Read'],
    Employee: ['Account.CloseSessions', 'Account.Read', 'Customers.Read', 'Customers.Write', 'Jobs.Read', 'Jobs.Write', 'Mfa.Manage'],
    Technician: ['Account.CloseSessions', 'Account.Read', 'Customers.Read', 'Jobs.Execute', 'Jobs.Read', 'Mfa.Manage']
};

export function buildAccount(overrides: Partial<CurrentAccount> = {}): CurrentAccount {
    const role = overrides.role ?? 'Owner';
    return {
        userId: '11111111-1111-1111-1111-111111111111',
        membershipId: '33333333-3333-3333-3333-333333333333',
        name: 'Ana Pérez',
        email: 'ana@empresa.com',
        tenantId: '22222222-2222-2222-2222-222222222222',
        tenantName: 'Fontanería Demo',
        role,
        permissions: PERMISSIONS_OF[role] ?? [],
        ...overrides
    };
}
