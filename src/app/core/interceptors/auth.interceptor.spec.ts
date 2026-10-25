import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../../../environments/environment';
import { AuthService } from '../services/auth';
import { buildSessionToken } from '../testing/fake-jwt';
import { authInterceptor } from './auth.interceptor';

describe('authInterceptor', () => {
    let http: HttpClient;
    let httpMock: HttpTestingController;
    let authService: AuthService;
    const jobsUrl = `${environment.apiUrl}/jobs`;
    const refreshUrl = `${environment.apiUrl}/auth/refresh`;
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
        const retry = httpMock.expectOne(jobsUrl);
        expect(retry.request.headers.get('Authorization')).toBe(`Bearer ${newToken}`);
        retry.flush([{ id: 1 }]);

        expect(body).toEqual([{ id: 1 }]);
    });

    it('logs out when the refresh is rejected too', () => {
        spyOn(authService, 'logout');

        http.get(jobsUrl).subscribe({ error: () => undefined });
        httpMock.expectOne(jobsUrl).flush(null, { status: 401, statusText: 'Unauthorized' });
        httpMock.expectOne(refreshUrl).flush(null, { status: 401, statusText: 'Unauthorized' });

        expect(authService.logout).toHaveBeenCalled();
    });

    it('leaves the 401 of the login alone (a wrong password is a normal answer)', () => {
        spyOn(authService, 'logout');

        http.post(`${environment.apiUrl}/auth/login`, {}).subscribe({ error: () => undefined });
        const req = httpMock.expectOne(`${environment.apiUrl}/auth/login`);
        expect(req.request.headers.has('Authorization')).toBeFalse();
        req.flush(null, { status: 401, statusText: 'Unauthorized' });

        expect(authService.logout).not.toHaveBeenCalled();
    });
});
