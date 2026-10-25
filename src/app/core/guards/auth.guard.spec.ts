import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { Observable, firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../services/auth';
import { buildSessionToken } from '../testing/fake-jwt';
import { authGuard } from './auth.guard';

describe('authGuard', () => {
    const runGuard = (url = '/jobs') => TestBed.runInInjectionContext(() => authGuard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot));
    const expired = buildSessionToken({ exp: Math.floor(Date.now() / 1000) - 60 });

    beforeEach(() => {
        sessionStorage.clear();
        TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
    });

    afterEach(() => {
        TestBed.inject(HttpTestingController).verify();
        sessionStorage.clear();
    });

    it('lets a valid session through', () => {
        TestBed.inject(AuthService).storeSession({ accessToken: buildSessionToken(), refreshToken: 'r', expiresAt: '' });

        expect(runGuard()).toBeTrue();
    });

    it('sends someone without a session to the login, remembering where they were going', async () => {
        const result = await firstValueFrom(runGuard('/jobs/42') as Observable<UrlTree>);

        expect(TestBed.inject(Router).serializeUrl(result)).toBe('/auth/login?returnUrl=%2Fjobs%2F42');
    });

    it('renews an expired session with the refresh token instead of asking for the password', async () => {
        TestBed.inject(AuthService).storeSession({ accessToken: expired, refreshToken: 'r', expiresAt: '' });

        const pending = firstValueFrom(runGuard() as Observable<boolean | UrlTree>);
        TestBed.inject(HttpTestingController)
            .expectOne(`${environment.apiUrl}/auth/refresh`)
            .flush({ accessToken: buildSessionToken(), refreshToken: 'r2', expiresAt: '' });

        expect(await pending).toBeTrue();
    });

    it('sends an expired session to the login when the refresh is rejected', async () => {
        TestBed.inject(AuthService).storeSession({ accessToken: expired, refreshToken: 'r', expiresAt: '' });

        const pending = firstValueFrom(runGuard() as Observable<boolean | UrlTree>);
        TestBed.inject(HttpTestingController).expectOne(`${environment.apiUrl}/auth/refresh`).flush(null, { status: 401, statusText: 'Unauthorized' });

        expect(await pending).toBeInstanceOf(UrlTree);
    });
});
