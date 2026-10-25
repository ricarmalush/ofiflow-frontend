import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthTokens } from '../../shared/models/auth.model';
import { CurrentSessionService } from './current-session';

const ACCESS_TOKEN_KEY = 'ofiflow_access_token';
const REFRESH_TOKEN_KEY = 'ofiflow_refresh_token';

// Guarda y borra la sesión. Las llamadas a /auth/login, /auth/mfa/verify y /auth/refresh se
// añaden en el bloque del login; aquí solo está lo que necesitan el guard y el interceptor.
//
// sessionStorage y no localStorage: la sesión muere al cerrar la pestaña, así que un token
// olvidado en un equipo compartido no sobrevive. Ninguno de los dos protege frente a XSS (un
// script inyectado puede leer ambos); esa defensa es no tener XSS (Angular escapa por defecto)
// y una CSP. La alternativa fuerte es el refresh token en una cookie HttpOnly, que exigiría
// cambiar la API: se decide en el bloque del login.
@Injectable({
    providedIn: 'root'
})
export class AuthService {
    private router = inject(Router);
    private currentSession = inject(CurrentSessionService);

    constructor() {
        this.currentSession.establish(this.getToken());
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

    logout(): void {
        sessionStorage.removeItem(ACCESS_TOKEN_KEY);
        sessionStorage.removeItem(REFRESH_TOKEN_KEY);
        this.currentSession.clear();
        this.router.navigate(['/auth/login']);
    }
}
