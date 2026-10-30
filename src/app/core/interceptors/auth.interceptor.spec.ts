import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { environment } from '../../../environments/environment';
import { TENANT_SUSPENDED_MESSAGE } from '../constants/api-error-codes';
import { AuthService, SESSION_ENDED_MESSAGE } from '../services/auth';
import { CurrentSessionService } from '../services/current-session';
import { buildAccount } from '../testing/fake-account';
import { buildSessionToken } from '../testing/fake-jwt';
import { authInterceptor } from './auth.interceptor';

describe('authInterceptor', () => {
    let http: HttpClient;
    let httpMock: HttpTestingController;
    let authService: AuthService;
    const jobsUrl = `${environment.apiUrl}/jobs`;
    const refreshUrl = `${environment.apiUrl}/auth/refresh`;
    const accountUrl = `${environment.apiUrl}/account/me`;
    const token = buildSessionToken();
    const newToken = buildSessionToken({ role: 'Admin' });

    beforeEach(() => {
        sessionStorage.clear();
        TestBed.configureTestingModule({
            providers: [provideRouter([]), provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting()]
        });
        http = TestBed.inject(HttpClient);
        httpMock = TestBed.inject(HttpTestingController);
        authService = TestBed.inject(AuthService);
        authService.storeSession({ accessToken: token, refreshToken: 'refresh-1', expiresAt: '' });
    });

    afterEach(() => {
        httpMock.verify();
        sessionStorage.clear();
    });

    it('adds the bearer token to calls to our API', () => {
        http.get(jobsUrl).subscribe();

        const req = httpMock.expectOne(jobsUrl);
        expect(req.request.headers.get('Authorization')).toBe(`Bearer ${token}`);
        req.flush([]);
    });

    it('never sends the token to another domain', () => {
        http.get('https://cdn.example.com/data.json').subscribe();

        const req = httpMock.expectOne('https://cdn.example.com/data.json');
        expect(req.request.headers.has('Authorization')).toBeFalse();
        req.flush({});
    });

    it('on a 401 refreshes the session and retries the request once with the new token', () => {
        let body: unknown;
        http.get(jobsUrl).subscribe((b) => (body = b));

        httpMock.expectOne(jobsUrl).flush(null, { status: 401, statusText: 'Unauthorized' });
        httpMock.expectOne(refreshUrl).flush({ accessToken: newToken, refreshToken: 'refresh-2', expiresAt: '' });
        httpMock.expectOne(accountUrl).flush(buildAccount()); // renovar la sesión también vuelve a preguntar quién soy
        const retry = httpMock.expectOne(jobsUrl);
        expect(retry.request.headers.get('Authorization')).toBe(`Bearer ${newToken}`);
        retry.flush([{ id: 1 }]);

        expect(body).toEqual([{ id: 1 }]);
    });

    it('does not show any notice when the refresh works (an expired access token is routine)', () => {
        spyOn(authService, 'logout');

        http.get(jobsUrl).subscribe();
        httpMock.expectOne(jobsUrl).flush(null, { status: 401, statusText: 'Unauthorized' });
        httpMock.expectOne(refreshUrl).flush({ accessToken: newToken, refreshToken: 'refresh-2', expiresAt: '' });
        httpMock.expectOne(accountUrl).flush(buildAccount());
        httpMock.expectOne(jobsUrl).flush([]);

        expect(authService.logout).not.toHaveBeenCalled();
    });

    describe('when the session was closed (spec 015 of the API)', () => {
        it('goes back to the login WITH a warning notice when the refresh is rejected too', () => {
            spyOn(authService, 'logout');

            http.get(jobsUrl).subscribe({ error: () => undefined });
            httpMock.expectOne(jobsUrl).flush(null, { status: 401, statusText: 'Unauthorized' });
            httpMock.expectOne(refreshUrl).flush(null, { status: 401, statusText: 'Unauthorized' });

            expect(authService.logout).toHaveBeenCalledOnceWith(SESSION_ENDED_MESSAGE, 'warn');
        });

        it('hands the notice to the login in the navigation state (not in the URL), with the warning severity', () => {
            const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);

            http.get(jobsUrl).subscribe({ error: () => undefined });
            httpMock.expectOne(jobsUrl).flush(null, { status: 401, statusText: 'Unauthorized' });
            httpMock.expectOne(refreshUrl).flush(null, { status: 401, statusText: 'Unauthorized' });

            expect(navigate).toHaveBeenCalledOnceWith(['/auth/login'], { state: { info: 'Tu sesión se cerró. Vuelve a entrar.', infoSeverity: 'warn' } });
            expect(authService.getToken()).toBeNull();
            expect(authService.getRefreshToken()).toBeNull();
        });

        it('still hands the original 401 to whoever made the request', () => {
            spyOn(authService, 'logout');
            let status: number | undefined;

            http.get(jobsUrl).subscribe({ error: (e) => (status = e.status) });
            httpMock.expectOne(jobsUrl).flush(null, { status: 401, statusText: 'Unauthorized' });
            httpMock.expectOne(refreshUrl).flush(null, { status: 401, statusText: 'Unauthorized' });

            expect(status).toBe(401);
        });

        it('with no refresh token left it asks nothing and goes back to the login with the notice', () => {
            spyOn(authService, 'logout');
            sessionStorage.removeItem('ofiflow_refresh_token');

            http.get(jobsUrl).subscribe({ error: () => undefined });
            httpMock.expectOne(jobsUrl).flush(null, { status: 401, statusText: 'Unauthorized' });

            httpMock.expectNone(refreshUrl);
            expect(authService.logout).toHaveBeenCalledOnceWith(SESSION_ENDED_MESSAGE, 'warn');
        });

        it('does not add the notice to a 403 (a role that cannot do something is not a closed session)', () => {
            spyOn(authService, 'logout');

            http.get(jobsUrl).subscribe({ error: () => undefined });
            httpMock.expectOne(jobsUrl).flush({ code: 'auth.forbidden' }, { status: 403, statusText: 'Forbidden' });
            httpMock.expectOne(accountUrl).flush(buildAccount());

            expect(authService.logout).not.toHaveBeenCalled();
        });
    });

    it('leaves the 401 of the login alone (a wrong password is a normal answer)', () => {
        spyOn(authService, 'logout');

        http.post(`${environment.apiUrl}/auth/login`, {}).subscribe({ error: () => undefined });
        const req = httpMock.expectOne(`${environment.apiUrl}/auth/login`);
        expect(req.request.headers.has('Authorization')).toBeFalse();
        req.flush(null, { status: 401, statusText: 'Unauthorized' });

        expect(authService.logout).not.toHaveBeenCalled();
    });

    describe('when the company is suspended (spec 011)', () => {
        const suspended = { status: 403, statusText: 'Forbidden' };

        it('logs out with the API message as a warning, and neither refreshes nor retries', () => {
            spyOn(authService, 'logout');

            let failed: unknown;
            http.get(jobsUrl).subscribe({ error: (e) => (failed = e) });
            httpMock.expectOne(jobsUrl).flush({ code: 'tenant.suspended', detail: 'La empresa está suspendida. Ponte en contacto con el soporte de OfiFlow.' }, suspended);

            // httpMock.verify() (afterEach) comprueba que no hubo refresh ni reintento.
            expect(authService.logout).toHaveBeenCalledOnceWith('La empresa está suspendida. Ponte en contacto con el soporte de OfiFlow.', 'warn');
            expect(failed).toBeTruthy(); // y el error sigue llegando a quien llamó
        });

        it('uses a fallback message if the 403 comes without text', () => {
            spyOn(authService, 'logout');

            http.get(jobsUrl).subscribe({ error: () => undefined });
            httpMock.expectOne(jobsUrl).flush({ code: 'tenant.suspended' }, suspended);

            expect(authService.logout).toHaveBeenCalledOnceWith(TENANT_SUSPENDED_MESSAGE, 'warn');
        });

        it('does NOT log out on a 403 for lack of permission: that one is about the role, not the session', () => {
            spyOn(authService, 'logout');

            http.get(jobsUrl).subscribe({ error: () => undefined });
            httpMock.expectOne(jobsUrl).flush({ code: 'auth.forbidden', detail: 'No tienes permiso.' }, suspended);
            httpMock.expectOne(accountUrl).flush(buildAccount()); // sí vuelve a pedir la cuenta (ver abajo)

            expect(authService.logout).not.toHaveBeenCalled();
        });

        it('does NOT log out on a 403 without a recognisable body', () => {
            spyOn(authService, 'logout');

            http.get(jobsUrl).subscribe({ error: () => undefined });
            httpMock.expectOne(jobsUrl).flush('<html>Forbidden</html>', suspended);

            expect(authService.logout).not.toHaveBeenCalled();
        });
    });

    describe('when the API says "your role cannot do this" (auth.forbidden)', () => {
        const forbidden = { status: 403, statusText: 'Forbidden' };

        it('asks again who I am: the interface was offering something the role no longer allows, so its idea of my role is stale', () => {
            const session = TestBed.inject(CurrentSessionService);
            session.setAccount(buildAccount({ role: 'Manager' })); // lo que la interfaz cree
            let failed: unknown;

            http.get(jobsUrl).subscribe({ error: (e) => (failed = e) });
            httpMock.expectOne(jobsUrl).flush({ code: 'auth.forbidden', detail: 'No tienes permiso.' }, forbidden);
            httpMock.expectOne(accountUrl).flush(buildAccount({ role: 'Technician' })); // lo que la API dice ahora

            expect(session.role()).toBe('Technician');
            expect(session.can('Jobs.Assign')).toBeFalse();
            expect(failed).toBeTruthy(); // y el error sigue llegando a quien llamó, para que avise al usuario
        });

        it('does not loop when the 403 is the one of the account request itself (a removed member)', () => {
            http.get(accountUrl).subscribe({ error: () => undefined });

            httpMock.expectOne(accountUrl).flush({ code: 'auth.forbidden', detail: 'No tienes permiso.' }, forbidden);

            httpMock.expectNone(accountUrl); // httpMock.verify() también lo comprueba
        });

        it('does not ask for the account on other errors (a 500 or a validation error say nothing about the role)', () => {
            http.get(jobsUrl).subscribe({ error: () => undefined });
            httpMock.expectOne(jobsUrl).flush({ code: 'server.unexpected' }, { status: 500, statusText: 'Server Error' });

            http.get(jobsUrl).subscribe({ error: () => undefined });
            httpMock.expectOne(jobsUrl).flush({ code: 'validation.failed' }, { status: 400, statusText: 'Bad Request' });

            httpMock.expectNone(accountUrl);
        });

        it('a suspended company closes the session instead of asking for the account', () => {
            spyOn(authService, 'logout');

            http.get(jobsUrl).subscribe({ error: () => undefined });
            httpMock.expectOne(jobsUrl).flush({ code: 'tenant.suspended', detail: 'Suspendida.' }, forbidden);

            httpMock.expectNone(accountUrl);
            expect(authService.logout).toHaveBeenCalled();
        });
    });
});
