import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { Observable, firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../services/auth';
import { CurrentSessionService } from '../services/current-session';
import { buildAccount } from '../testing/fake-account';
import { buildSessionToken } from '../testing/fake-jwt';
import { ACCOUNT_UNAVAILABLE_MESSAGE, authGuard } from './auth.guard';

describe('authGuard', () => {
    const runGuard = (url = '/jobs') => TestBed.runInInjectionContext(() => authGuard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot)) as Observable<boolean | UrlTree>;
    const expired = buildSessionToken({ exp: Math.floor(Date.now() / 1000) - 60 });
    const accountUrl = `${environment.apiUrl}/account/me`;
    let httpMock: HttpTestingController;

    beforeEach(() => {
        sessionStorage.clear();
        TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
        httpMock = TestBed.inject(HttpTestingController);
    });

    afterEach(() => {
        httpMock.verify();
        sessionStorage.clear();
    });

    it('lets a valid session through once the account is loaded', async () => {
        TestBed.inject(AuthService).storeSession({ accessToken: buildSessionToken(), refreshToken: 'r', expiresAt: '' });

        const pending = firstValueFrom(runGuard());
        httpMock.expectOne(accountUrl).flush(buildAccount());

        expect(await pending).toBeTrue();
        expect(TestBed.inject(CurrentSessionService).role()).toBe('Owner');
    });

    it('does not let anything be painted before knowing what the person can do: it waits for the account', () => {
        TestBed.inject(AuthService).storeSession({ accessToken: buildSessionToken(), refreshToken: 'r', expiresAt: '' });
        let decided = false;

        runGuard().subscribe(() => (decided = true));

        expect(decided).toBeFalse(); // la petición de la cuenta sigue en vuelo
        httpMock.expectOne(accountUrl).flush(buildAccount());
        expect(decided).toBeTrue();
    });

    it('does not ask for the account again when it is already loaded', async () => {
        TestBed.inject(AuthService).storeSession({ accessToken: buildSessionToken(), refreshToken: 'r', expiresAt: '' });
        TestBed.inject(CurrentSessionService).setAccount(buildAccount());

        expect(await firstValueFrom(runGuard())).toBeTrue();
        httpMock.expectNone(accountUrl);
    });

    it('sends someone without a session to the login, remembering where they were going', async () => {
        const result = (await firstValueFrom(runGuard('/jobs/42'))) as UrlTree;

        expect(TestBed.inject(Router).serializeUrl(result)).toBe('/auth/login?returnUrl=%2Fjobs%2F42');
        httpMock.expectNone(accountUrl); // sin sesión no se pregunta nada
    });

    it('renews an expired session with the refresh token instead of asking for the password, and then loads the account', async () => {
        TestBed.inject(AuthService).storeSession({ accessToken: expired, refreshToken: 'r', expiresAt: '' });

        const pending = firstValueFrom(runGuard());
        httpMock.expectOne(`${environment.apiUrl}/auth/refresh`).flush({ accessToken: buildSessionToken(), refreshToken: 'r2', expiresAt: '' });
        httpMock.expectOne(accountUrl).flush(buildAccount()); // una sola petición: la de renovar y la del guardián se comparten

        expect(await pending).toBeTrue();
    });

    it('sends an expired session to the login when the refresh is rejected', async () => {
        TestBed.inject(AuthService).storeSession({ accessToken: expired, refreshToken: 'r', expiresAt: '' });

        const pending = firstValueFrom(runGuard());
        httpMock.expectOne(`${environment.apiUrl}/auth/refresh`).flush(null, { status: 401, statusText: 'Unauthorized' });

        expect(await pending).toBeInstanceOf(UrlTree);
    });

    it('with a session but without being able to read the account, it does not show an interface with no permissions as if it were normal: it closes the session with a warning', async () => {
        TestBed.inject(AuthService).storeSession({ accessToken: buildSessionToken(), refreshToken: 'r', expiresAt: '' });
        const logout = spyOn(TestBed.inject(AuthService), 'logout');

        const pending = firstValueFrom(runGuard());
        httpMock.expectOne(accountUrl).flush({ code: 'server.unexpected' }, { status: 500, statusText: 'Server Error' });

        expect(await pending).toBeFalse();
        expect(logout).toHaveBeenCalledOnceWith(ACCOUNT_UNAVAILABLE_MESSAGE, 'warn');
    });
});
