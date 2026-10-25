import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { AuthService } from '../services/auth';
import { buildSessionToken } from '../testing/fake-jwt';
import { authGuard } from './auth.guard';

describe('authGuard', () => {
    const runGuard = () => TestBed.runInInjectionContext(() => authGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot));

    beforeEach(() => {
        sessionStorage.clear();
        TestBed.configureTestingModule({ providers: [provideRouter([])] });
    });

    afterEach(() => sessionStorage.clear());

    it('lets a valid session through', () => {
        TestBed.inject(AuthService).storeSession({ accessToken: buildSessionToken(), refreshToken: 'r', expiresAt: '' });

        expect(runGuard()).toBeTrue();
    });

    it('sends someone without a session to the login', () => {
        const result = runGuard() as UrlTree;

        expect(TestBed.inject(Router).serializeUrl(result)).toBe('/auth/login');
    });

    it('sends an expired session to the login', () => {
        const expired = buildSessionToken({ exp: Math.floor(Date.now() / 1000) - 60 });
        TestBed.inject(AuthService).storeSession({ accessToken: expired, refreshToken: 'r', expiresAt: '' });

        expect(runGuard()).toBeInstanceOf(UrlTree);
    });
});
