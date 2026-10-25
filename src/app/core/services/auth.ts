import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, finalize, map, of, shareReplay, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthTokens, LoginOutcome, MfaChallenge } from '../../shared/models/auth.model';
import { OperationResult } from '../../shared/models/result.model';
import { extractErrorMessage, toOperationResult } from '../utils/http-result.util';
import { CurrentSessionService } from './current-session';

const ACCESS_TOKEN_KEY = 'ofiflow_access_token';
const REFRESH_TOKEN_KEY = 'ofiflow_refresh_token';

// La API responde 401 sin cuerpo en todos los fallos del login (email desconocido, contraseña
// errónea, cuenta bloqueada...) y del código, a propósito: no revela cuál fue. El texto lo pone
// el cliente y tampoco distingue.
export const INVALID_CREDENTIALS_MESSAGE = 'Email o contraseña incorrectos.';
export const INVALID_MFA_CODE_MESSAGE = 'El código no es válido o ha caducado.';

// Guarda la sesión y habla con /auth/login, /auth/mfa/verify y /auth/refresh.
//
// sessionStorage y no localStorage: la sesión muere al cerrar la pestaña, así que un token
// olvidado en un equipo compartido no sobrevive. Ninguno de los dos protege frente a XSS (un
// script inyectado puede leer ambos); esa defensa es no tener XSS (Angular escapa por defecto)
// y una CSP. La alternativa fuerte es el refresh token en una cookie HttpOnly, que exigiría
// cambiar la API (hoy lo devuelve en el cuerpo).
@Injectable({
    providedIn: 'root'
})
export class AuthService {
    private http = inject(HttpClient);
    private router = inject(Router);
    private currentSession = inject(CurrentSessionService);
    private authUrl = `${environment.apiUrl}/auth`;

    // Refresh en curso, compartido. La API rota el refresh token y, si ve usar dos veces el mismo,
    // lo trata como robado y revoca toda la cadena. Sin esto, dos peticiones que reciben 401 a la
    // vez harían dos refresh con el mismo token y la segunda cerraría la sesión del usuario.
    private refreshInFlight: Observable<boolean> | null = null;

    constructor() {
        this.currentSession.establish(this.getToken());
    }

    login(email: string, password: string): Observable<LoginOutcome> {
        return this.http.post<AuthTokens | MfaChallenge>(`${this.authUrl}/login`, { email, password }).pipe(
            map((response): LoginOutcome => {
                if ('mfaRequired' in response) {
                    return { kind: 'mfa-required', challenge: response.challenge, expiresAt: response.expiresAt };
                }
                this.storeSession(response);
                return { kind: 'authenticated' };
            }),
            catchError((error: HttpErrorResponse) => of<LoginOutcome>({ kind: 'failed', message: error.status === 401 ? INVALID_CREDENTIALS_MESSAGE : extractErrorMessage(error) }))
        );
    }

    verifyMfa(challenge: string, code: string): Observable<OperationResult> {
        return this.http.post<AuthTokens>(`${this.authUrl}/mfa/verify`, { challenge, code }).pipe(
            tap((tokens) => this.storeSession(tokens)),
            map(() => ({ isSuccess: true, message: '' })),
            catchError((error: HttpErrorResponse) => of<OperationResult>({ isSuccess: false, message: error.status === 401 ? INVALID_MFA_CODE_MESSAGE : extractErrorMessage(error) }))
        );
    }

    // La persona invitada elige su nombre y su contraseña; la API no devuelve sesión, así que
    // después entra por el login normal. Un token caducado, revocado, usado o inventado dan el
    // mismo error (invitation.invalid): la API no dice cuál de los cuatro fue.
    acceptInvitation(token: string, name: string, password: string): Observable<OperationResult> {
        return toOperationResult(this.http.post<void>(`${this.authUrl}/accept-invitation`, { token, name, password }));
    }

    // Cambia el refresh token por un par nuevo. true si hay sesión nueva; false si no había
    // refresh token o la API lo rechazó (caducado, revocado), y entonces la sesión se borra.
    refresh(): Observable<boolean> {
        const refreshToken = this.getRefreshToken();
        if (!refreshToken) {
            return of(false);
        }

        this.refreshInFlight ??= this.http.post<AuthTokens>(`${this.authUrl}/refresh`, { refreshToken }).pipe(
            tap((tokens) => this.storeSession(tokens)),
            map(() => true),
            catchError(() => {
                this.clearSession();
                return of(false);
            }),
            finalize(() => (this.refreshInFlight = null)),
            shareReplay(1)
        );
        return this.refreshInFlight;
    }

    getToken(): string | null {
        return sessionStorage.getItem(ACCESS_TOKEN_KEY);
    }

    getRefreshToken(): string | null {
        return sessionStorage.getItem(REFRESH_TOKEN_KEY);
    }

    storeSession(tokens: AuthTokens): void {
        sessionStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
        sessionStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
        this.currentSession.establish(tokens.accessToken);
    }

    isAuthenticated(): boolean {
        return !!this.getToken() && !this.currentSession.isExpired();
    }

    // Solo local: la API no tiene endpoint de logout. El refresh token sigue siendo válido en el
    // servidor hasta que caduca (pendiente en la API); aquí deja de estar en el navegador.
    logout(): void {
        this.clearSession();
        this.router.navigate(['/auth/login']);
    }

    private clearSession(): void {
        sessionStorage.removeItem(ACCESS_TOKEN_KEY);
        sessionStorage.removeItem(REFRESH_TOKEN_KEY);
        this.currentSession.clear();
    }
}
