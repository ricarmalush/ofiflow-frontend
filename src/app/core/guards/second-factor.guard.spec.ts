import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { CurrentSessionService } from '../services/current-session';
import { buildAccount } from '../testing/fake-account';
import { buildSessionToken } from '../testing/fake-jwt';
import { secondFactorGuard } from './second-factor.guard';

describe('secondFactorGuard (spec 022)', () => {
    const run = (url: string) => TestBed.runInInjectionContext(() => secondFactorGuard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot));
    const serialize = (result: unknown) => TestBed.inject(Router).serializeUrl(result as UrlTree);

    beforeEach(() => TestBed.configureTestingModule({ providers: [provideRouter([])] }));

    function enter(account: Parameters<typeof buildAccount>[0]): void {
        const session = TestBed.inject(CurrentSessionService);
        session.establish(buildSessionToken());
        session.setAccount(buildAccount(account));
    }

    describe('whoever does NOT have to enrol the factor', () => {
        it('goes anywhere', () => {
            enter({ role: 'Technician', secondFactorEnrollmentRequired: false });

            for (const url of ['/', '/customers', '/jobs/123', '/team', '/account/security']) {
                expect(run(url)).withContext(url).toBeTrue();
            }
        });

        it('an Owner who already has the factor (the API says so) goes anywhere', () => {
            enter({ role: 'Owner', secondFactorEnrollmentRequired: false, secondFactorRequired: true });

            expect(run('/customers')).toBeTrue();
        });
    });

    describe('whoever must enrol the factor and has not', () => {
        beforeEach(() => enter({ role: 'Owner', secondFactorEnrollmentRequired: true, secondFactorRequired: true }));

        it('is sent to the security screen from any other screen, without a returnUrl (they cannot go back until they enrol)', () => {
            for (const url of ['/', '/customers', '/customers/new', '/jobs/123', '/agenda', '/team']) {
                expect(serialize(run(url)))
                    .withContext(url)
                    .toBe('/account/security');
            }
        });

        it('may stay on the security screen: it is where they are sent', () => {
            expect(run('/account/security')).toBeTrue();
        });

        it('the security screen is recognised with a query string or a fragment too', () => {
            expect(run('/account/security?step=1')).toBeTrue();
            expect(run('/account/security#codes')).toBeTrue();
        });

        it('but not a look-alike path: it is compared whole, not by prefix', () => {
            expect(serialize(run('/account/security-evil'))).toBe('/account/security');
            expect(serialize(run('/account/security/other'))).toBe('/account/security');
            expect(serialize(run('/customers?next=/account/security'))).toBe('/account/security');
        });
    });

    it('obeys what the API said, not the role name: a Technician the API says must enrol is sent away', () => {
        enter({ role: 'Technician', secondFactorEnrollmentRequired: true });

        expect(serialize(run('/customers'))).toBe('/account/security');
    });

    it('obeys what the API said, not the role name: an Admin the API says need not enrol goes through', () => {
        enter({ role: 'Admin', secondFactorEnrollmentRequired: false });

        expect(run('/customers')).toBeTrue();
    });

    it('does not decide while the account is not loaded (authGuard, which runs first, already requires it): the API denies anyway', () => {
        TestBed.inject(CurrentSessionService).establish(buildSessionToken({ role: 'Owner' }));

        expect(run('/customers')).toBeTrue();
    });
});
