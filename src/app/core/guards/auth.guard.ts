import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../services/auth';

// Solo decide qué pantalla ver: sin sesión vigente, al login. No es una medida de seguridad
// (se salta desde las herramientas del navegador); la protección real es que la API rechaza
// con 401 cualquier petición sin un token válido.
export const authGuard: CanActivateFn = (_route, state) => {
    const authService = inject(AuthService);
    const router = inject(Router);

    // Devolver un UrlTree en vez de navegar y devolver false: el router cancela y redirige en
    // una sola navegación. returnUrl lleva de vuelta a donde iba después de entrar.
    const toLogin = router.createUrlTree(['/auth/login'], { queryParams: { returnUrl: state.url } });

    if (authService.isAuthenticated()) {
        return true;
    }

    // Access token caducado pero refresh token vigente (p. ej. al recargar tras 30 min): se
    // renueva la sesión sin pedir otra vez la contraseña.
    return authService.refresh().pipe(map((refreshed) => (refreshed ? true : toLogin)));
};
