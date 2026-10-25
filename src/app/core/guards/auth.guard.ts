import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth';

// Solo decide qué pantalla ver: sin sesión vigente, al login. No es una medida de seguridad
// (se salta desde las herramientas del navegador); la protección real es que la API rechaza
// con 401 cualquier petición sin un token válido.
export const authGuard: CanActivateFn = () => {
    const authService = inject(AuthService);
    const router = inject(Router);

    // Devolver un UrlTree en vez de navegar y devolver false: el router cancela y redirige en
    // una sola navegación, sin dos navegaciones compitiendo.
    return authService.isAuthenticated() ? true : router.createUrlTree(['/auth/login']);
};
