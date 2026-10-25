import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../services/auth';

// Rutas que responden 401 como parte normal de su flujo (credenciales o código erróneos):
// ese 401 lo muestra la pantalla de login, no debe cerrar la sesión.
const AUTH_ROUTES = `${environment.apiUrl}/auth/`;

export const authInterceptor: HttpInterceptorFn = (req, next) => {
    // El token solo viaja a nuestra API. Si se añadiera a cualquier petición, una llamada a un
    // dominio externo (un CDN, un servicio de mapas...) se llevaría la sesión del usuario.
    if (!req.url.startsWith(environment.apiUrl)) {
        return next(req);
    }

    const authService = inject(AuthService);
    const token = authService.getToken();
    const authReq = token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

    return next(authReq).pipe(
        catchError((error: HttpErrorResponse) => {
            if (error.status === 401 && !req.url.startsWith(AUTH_ROUTES)) {
                authService.logout();
            }
            return throwError(() => error);
        })
    );
};
