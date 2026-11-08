import { inject } from '@angular/core';
import { CanActivateChildFn, Router } from '@angular/router';
import { SECURITY_ROUTE } from '../constants/api-error-codes';
import { CurrentSessionService } from '../services/current-session';

// Quien debe activar el segundo factor y todavía no lo tiene (spec 022) solo puede ir a la pantalla de seguridad, donde se activa. Se comprueba al entrar en CUALQUIER ruta hija de la zona
// privada (canActivateChild), así que una URL escrita a mano también cae aquí. Va detrás de authGuard (la cuenta ya está cargada: sin ella no sabríamos quién debe qué).
//
// Es solo interfaz, como authGuard y permissionGuard: se salta desde las herramientas del navegador, y no importa, porque la protección real es la API, que da 403
// `mfa.enrollment_required` a cada petición de quien debe activarlo y no puede hacer nada más que activarlo. Esto solo evita enseñarle pantallas que darían 403.
export const secondFactorGuard: CanActivateChildFn = (_childRoute, state) => {
    const session = inject(CurrentSessionService);
    const router = inject(Router);

    if (!session.mustEnrollSecondFactor()) {
        return true;
    }

    // La propia pantalla de seguridad (sin mirar la consulta ni el fragmento) sí: es adonde se le lleva. Cualquier otra, a ella: sin returnUrl, porque no puede volver a lo que pedía hasta activarlo.
    const path = state.url.split(/[?#]/)[0];
    return path === SECURITY_ROUTE || router.createUrlTree([SECURITY_ROUTE]);
};
