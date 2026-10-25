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
    const token = buildSessionToken();

    beforeEach(() => {
        sessionStorage.clear();
        TestBed.configureTestingModule({
            providers: [provideRouter([]), provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting()]
        });
        http = TestBed.inject(HttpClient);
        httpMock = TestBed.inject(HttpTestingController);
        authService = TestBed.inject(AuthService);
        authService.storeSession({ accessToken: token, refreshToken: 'refresh', expiresAt: '' });
    });

    afterEach(() => {
        httpMock.verify();
        sessionStorage.clear();
    });

    it('adds the bearer token to calls to our API', () => {
        http.get(`${environment.apiUrl}/jobs`).subscribe();

        const req = httpMock.expectOne(`${environment.apiUrl}/jobs`);
        expect(req.request.headers.get('Authorization')).toBe(`Bearer ${token}`);
        req.flush([]);
    });

    it('never sends the token to another domain', () => {
        http.get('https://cdn.example.com/data.json').subscribe();

        const req = httpMock.expectOne('https://cdn.example.com/data.json');
        expect(req.request.headers.has('Authorization')).toBeFalse();
        req.flush({});
    });

    it('logs out when the API rejects the token', () => {
        spyOn(authService, 'logout');

        http.get(`${environment.apiUrl}/jobs`).subscribe({ error: () => undefined });
        httpMock.expectOne(`${environment.apiUrl}/jobs`).flush(null, { status: 401, statusText: 'Unauthorized' });

        expect(authService.logout).toHaveBeenCalled();
    });

    it('does not log out on a 401 from the login itself (wrong password is a normal answer)', () => {
        spyOn(authService, 'logout');

        http.post(`${environment.apiUrl}/auth/login`, {}).subscribe({ error: () => undefined });
        httpMock.expectOne(`${environment.apiUrl}/auth/login`).flush(null, { status: 401, statusText: 'Unauthorized' });

        expect(authService.logout).not.toHaveBeenCalled();
    });
});
