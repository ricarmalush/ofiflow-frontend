import { TestBed } from '@angular/core/testing';
import { CurrentAccount } from '../../shared/models/account.model';
import { buildSessionToken } from '../testing/fake-jwt';
import { CurrentSessionService } from './current-session';

const account: CurrentAccount = {
    userId: '11111111-1111-1111-1111-111111111111',
    membershipId: '33333333-3333-3333-3333-333333333333',
    name: 'Ana',
    email: 'ana@empresa.com',
    tenantId: '22222222-2222-2222-2222-222222222222',
    tenantName: 'Empresa',
    role: 'Manager',
    permissions: ['Customers.Read', 'Customers.Write', 'Jobs.Assign']
};

describe('CurrentSessionService', () => {
    let service: CurrentSessionService;

    beforeEach(() => {
        TestBed.configureTestingModule({});
        service = TestBed.inject(CurrentSessionService);
    });

    it('has no session and no account before anything is established', () => {
        expect(service.session()).toBeNull();
        expect(service.account()).toBeNull();
        expect(service.role()).toBeNull();
        expect(service.isExpired()).toBeTrue();
    });

    it('reads the user, tenant and the role the TOKEN said from the claims the API writes', () => {
        service.establish(buildSessionToken({ role: 'Technician' }));

        expect(service.session()?.userId).toBe('11111111-1111-1111-1111-111111111111');
        expect(service.tenantId()).toBe('22222222-2222-2222-2222-222222222222');
        expect(service.session()?.tokenRole).toBe('Technician');
        expect(service.isExpired()).toBeFalse();
    });

    it('the token role does NOT decide anything: without an account loaded there is no role and no permission', () => {
        service.establish(buildSessionToken({ role: 'Owner' }));

        expect(service.role()).toBeNull();
        expect(service.can('Customers.Read')).toBeFalse();
    });

    it('treats a token past its exp as expired', () => {
        service.establish(buildSessionToken({ exp: Math.floor(Date.now() / 1000) - 60 }));

        expect(service.isExpired()).toBeTrue();
    });

    it('rejects a token without the tenant claim instead of half-filling the session', () => {
        service.establish(buildSessionToken({ tenant_id: undefined }));

        expect(service.session()).toBeNull();
    });

    it('rejects a token that is not a JWT', () => {
        service.establish('not-a-jwt');

        expect(service.session()).toBeNull();
    });

    describe('the account', () => {
        beforeEach(() => service.establish(buildSessionToken()));

        it('grants exactly what the API said: a Manager writes customers but cannot delete them', () => {
            service.setAccount(account);

            expect(service.role()).toBe('Manager');
            expect(service.can('Customers.Write')).toBeTrue();
            expect(service.can('Customers.Delete')).toBeFalse();
        });

        it('exposes the membership id and the company', () => {
            service.setAccount(account);

            expect(service.membershipId()).toBe('33333333-3333-3333-3333-333333333333');
            expect(service.account()?.tenantName).toBe('Empresa');
        });

        it('keeps the account when the session renews for the SAME person (a refresh gives a new token, not a new person)', () => {
            service.setAccount(account);

            service.establish(buildSessionToken());

            expect(service.account()).not.toBeNull();
        });

        it('drops the account when ANOTHER person gets the session in the same browser', () => {
            service.setAccount(account);

            service.establish(buildSessionToken({ sub: '99999999-9999-9999-9999-999999999999' }));

            expect(service.account()).toBeNull();
            expect(service.can('Customers.Read')).toBeFalse();
        });

        it('an unknown permission name is simply not granted', () => {
            service.setAccount({ ...account, permissions: ['Something.New'] });

            expect(service.can('Customers.Read')).toBeFalse();
        });

        it('forgets the session AND the account on clear()', () => {
            service.setAccount(account);
            service.clear();

            expect(service.session()).toBeNull();
            expect(service.account()).toBeNull();
            expect(service.membershipId()).toBeNull();
        });
    });
});
