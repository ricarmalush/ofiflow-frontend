import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map, of, switchMap } from 'rxjs';
import { AccountService } from '../services/account';
import { AuthService } from '../services/auth';

// Mensaje cuando la sesión es válida pero no se pudo saber quién eres (la API no respondió).
export const ACCOUNT_UNAVAILABLE_MESSAGE = 'No se pudieron cargar los datos de tu cuenta. Inténtalo de nuevo.';

// Solo decide qué pantalla ver: sin sesión vigente, al login. No es una medida de seguridad
// (se salta desde las herramientas del navegador); la protección real es que la API rechaza
// con 401 cualquier petición sin un token válido.
export const authGuard: CanActivateFn = (_route, state) => {
    const authService = inject(AuthService);
    const accountService = inject(AccountService);
    const router = inject(Router);

    // Devolver un UrlTree en vez de navegar y devolver false: el router cancela y redirige en
    // una sola navegación. returnUrl lleva de vuelta a donde iba después de entrar.
    const toLogin = router.createUrlTree(['/auth/login'], { queryParams: { returnUrl: state.url } });

    // Access token caducado pero refresh token vigente (p. ej. al recargar tras 30 min): se
    // renueva la sesión sin pedir otra vez la contraseña.
    const session$ = authService.isAuthenticated() ? of(true) : authService.refresh();

    return session$.pipe(
        // Con sesión, antes de pintar nada hay que saber QUÉ PUEDE HACER esta persona (rol y permisos, que ahora
        // dice la API y no una tabla copiada). Sin eso el menú y los botones saldrían vacíos o, peor, desfasados.
        switchMap((hasSession) => (hasSession ? accountService.ensureLoaded() : of(null))),
        map((loaded) => {
            if (loaded === null) {
                return toLogin;
            }
            if (!loaded) {
                // Hay sesión pero la API no contestó: no se enseña una interfaz sin permisos como si fuera lo normal.
                authService.logout(ACCOUNT_UNAVAILABLE_MESSAGE, 'warn');
                return false;
            }
            return true;
        })
    );
};
