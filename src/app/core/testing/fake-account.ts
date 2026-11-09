import { CurrentAccount } from '../../shared/models/account.model';
import { TenantRole } from '../../shared/models/auth.model';

// Solo para tests. Una cuenta como la que devolvería GET /account/me. Las listas de permisos de cada
// rol están escritas aquí A MANO y solo sirven para que los tests tengan un rol creíble: el código de
// la aplicación NO las usa (los permisos reales los dice la API). Si el backend cambia la tabla, lo
// que importa es que la aplicación obedezca a la API, no que estas listas coincidan.
const OWNER = ['Account.ChangePassword', 'Account.CloseSessions', 'Account.Read', 'Customers.Delete', 'Customers.Read', 'Customers.Write', 'Jobs.Assign', 'Jobs.Cancel', 'Jobs.Execute', 'Jobs.Read', 'Jobs.Schedule', 'Jobs.Write', 'Mfa.Manage', 'Quotes.Issue', 'Quotes.Read', 'Quotes.Write', 'Users.Manage', 'Users.Read'];

export const PERMISSIONS_OF: Readonly<Record<TenantRole, string[]>> = {
    Owner: OWNER,
    Admin: OWNER,
    Manager: ['Account.ChangePassword', 'Account.CloseSessions', 'Account.Read', 'Customers.Read', 'Customers.Write', 'Jobs.Assign', 'Jobs.Cancel', 'Jobs.Execute', 'Jobs.Read', 'Jobs.Schedule', 'Jobs.Write', 'Mfa.Manage', 'Quotes.Issue', 'Quotes.Read', 'Quotes.Write', 'Users.Read'],
    // Prepara presupuestos (los ve y los escribe) pero no los compromete: enviar, aceptar y rechazar es Quotes.Issue (spec 023 D11).
    Employee: ['Account.ChangePassword', 'Account.CloseSessions', 'Account.Read', 'Customers.Read', 'Customers.Write', 'Jobs.Read', 'Jobs.Write', 'Mfa.Manage', 'Quotes.Read', 'Quotes.Write'],
    Technician: ['Account.ChangePassword', 'Account.CloseSessions', 'Account.Read', 'Customers.Read', 'Jobs.Execute', 'Jobs.Read', 'Mfa.Manage']
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
        // Neutros a propósito: la regla de qué roles lo exigen la dice la API, no este fichero. Cada test que la necesita lo indica.
        secondFactorEnrollmentRequired: false,
        secondFactorRequired: false,
        ...overrides
    };
}
