import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ProblemDetails } from '../../shared/models/problem-details.model';
import { FORBIDDEN_CODE, TENANT_SUSPENDED_CODE, TENANT_SUSPENDED_MESSAGE } from '../constants/api-error-codes';
import { AccountService } from '../services/account';
import { AuthService, SESSION_ENDED_MESSAGE } from '../services/auth';

// Rutas anónimas de la API: no llevan token, y su 401 es una respuesta normal del flujo
// (credenciales o código erróneos) que muestra la pantalla de login, no una sesión caducada.
const AUTH_ROUTES = `${environment.apiUrl}/auth/`;
const ACCOUNT_URL = `${environment.apiUrl}/account/me`;

function withToken(req: HttpRequest<unknown>, token: string | null): HttpRequest<unknown> {
    return token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;
}

// Se decide por el código estable, nunca por el texto ni solo por el 403: un 403 también es
// "tu rol no puede hacer esto" (auth.forbidden), y eso no cierra la sesión.
function isTenantSuspended(error: HttpErrorResponse): boolean {
    return error.status === 403 && (error.error as ProblemDetails | null)?.code === TENANT_SUSPENDED_CODE;
}

function isForbidden(error: HttpErrorResponse): boolean {
    return error.status === 403 && (error.error as ProblemDetails | null)?.code === FORBIDDEN_CODE;
}

export const authInterceptor: HttpInterceptorFn = (req, next) => {
    // El token solo viaja a nuestra API. Si se añadiera a cualquier petición, una llamada a un
    // dominio externo (un CDN, un servicio de mapas...) se llevaría la sesión del usuario.
    if (!req.url.startsWith(environment.apiUrl) || req.url.startsWith(AUTH_ROUTES)) {
        return next(req);
    }

    // inject() solo funciona aquí, al empezar el interceptor, y no dentro de los callbacks de más abajo.
    const authService = inject(AuthService);
    const accountService = inject(AccountService);

    return next(withToken(req, authService.getToken())).pipe(
        catchError((error: HttpErrorResponse) => {
            // La empresa está suspendida (spec 011): ni renovar la sesión ni reintentar sirven de nada,
            // porque la API rechaza cada petición mientras dure. Se cierra la sesión con un aviso que lo
            // explica, en vez de dejar al usuario ante errores sueltos en cada pantalla.
            if (isTenantSuspended(error)) {
                authService.logout((error.error as ProblemDetails).detail || TENANT_SUSPENDED_MESSAGE, 'warn');
                return throwError(() => error);
            }

            // "Tu rol no puede hacer esto": si la interfaz lo estaba ofreciendo es que su idea de mi rol está desfasada (un
            // gestor me lo cambió). Se vuelve a pedir la cuenta, sin esperar, para que lo próximo que se pinte sea correcto.
            // El error sigue su camino: quien hizo la petición avisa al usuario con el texto de la API.
            // Salvo que el 403 sea el de la propia petición de la cuenta (un miembro quitado): pedirla otra vez sería un bucle.
            if (isForbidden(error)) {
                if (req.url !== ACCOUNT_URL) {
                    accountService.load().subscribe();
                }
                return throwError(() => error);
            }

            if (error.status !== 401) {
                return throwError(() => error);
            }

            // Access token caducado (dura 30 min) o de una sesión cerrada (spec 015 de la API: cerrar una sesión, todas, cambiar el segundo
            // factor o una baja dejan sin efecto su access token en la petición siguiente): se cambia el refresh token por uno nuevo y se
            // repite la petición una sola vez. Si el refresh falla, la sesión se acabó de verdad. Se vuelve al login CON un aviso: sin él,
            // quien tenía la pestaña abierta mientras su sesión se cerraba en otro sitio (o por otra persona con su cuenta) veía la pantalla
            // de entrada sin saber por qué.
            return authService.refresh().pipe(
                switchMap((refreshed) => {
                    if (!refreshed) {
                        authService.logout(SESSION_ENDED_MESSAGE, 'warn');
                        return throwError(() => error);
                    }
                    return next(withToken(req, authService.getToken()));
                })
            );
        })
    );
};
