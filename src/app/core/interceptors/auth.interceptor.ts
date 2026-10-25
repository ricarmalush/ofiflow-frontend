import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../services/auth';

// Rutas anónimas de la API: no llevan token, y su 401 es una respuesta normal del flujo
// (credenciales o código erróneos) que muestra la pantalla de login, no una sesión caducada.
const AUTH_ROUTES = `${environment.apiUrl}/auth/`;

function withToken(req: HttpRequest<unknown>, token: string | null): HttpRequest<unknown> {
    return token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;
}

export const authInterceptor: HttpInterceptorFn = (req, next) => {
    // El token solo viaja a nuestra API. Si se añadiera a cualquier petición, una llamada a un
    // dominio externo (un CDN, un servicio de mapas...) se llevaría la sesión del usuario.
    if (!req.url.startsWith(environment.apiUrl) || req.url.startsWith(AUTH_ROUTES)) {
        return next(req);
    }

    const authService = inject(AuthService);

    return next(withToken(req, authService.getToken())).pipe(
        catchError((error: HttpErrorResponse) => {
            if (error.status !== 401) {
                return throwError(() => error);
            }

            // Access token caducado (dura 30 min): se cambia el refresh token por uno nuevo y se
            // repite la petición una sola vez. Si el refresh falla, la sesión se acabó de verdad.
            return authService.refresh().pipe(
                switchMap((refreshed) => {
                    if (!refreshed) {
                        authService.logout();
                        return throwError(() => error);
                    }
                    return next(withToken(req, authService.getToken()));
                })
            );
        })
    );
};
