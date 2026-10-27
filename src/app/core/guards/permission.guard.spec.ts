import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { CurrentSessionService } from '../services/current-session';
import { buildAccount } from '../testing/fake-account';
import { buildSessionToken } from '../testing/fake-jwt';
import { permissionGuard } from './permission.guard';

describe('permissionGuard', () => {
    const run = () => TestBed.runInInjectionContext(() => permissionGuard('Customers.Write')({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot));

    beforeEach(() => TestBed.configureTestingModule({ providers: [provideRouter([])] }));

    function enter(account: Parameters<typeof buildAccount>[0]): void {
        const session = TestBed.inject(CurrentSessionService);
        session.establish(buildSessionToken());
        session.setAccount(buildAccount(account));
    }

    it('lets a role with the permission through', () => {
        enter({ role: 'Employee' });

        expect(run()).toBeTrue();
    });

    it('sends a role without it to the access-denied page', () => {
        enter({ role: 'Technician' });

        const result = run() as UrlTree;
        expect(TestBed.inject(Router).serializeUrl(result)).toBe('/auth/access');
    });

    it('obeys what the API said, not the role name: an Owner without the permission is sent away', () => {
        enter({ role: 'Owner', permissions: ['Customers.Read'] });

        expect(run()).toBeInstanceOf(UrlTree);
    });

    it('denies when the account is not loaded (fail-closed), whatever the token says', () => {
        TestBed.inject(CurrentSessionService).establish(buildSessionToken({ role: 'Owner' }));

        expect(run()).toBeInstanceOf(UrlTree);
    });
});
