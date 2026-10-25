import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Permission } from '../../shared/models/permission.model';
import { CurrentSessionService } from '../services/current-session';

// Para quien entra escribiendo la URL de una pantalla que su rol no puede usar: en vez de una
// página que solo daría 403, la pantalla de acceso denegado. Igual que authGuard, es interfaz;
// la API es la que niega. Va detrás de authGuard, así que aquí ya hay sesión.
export function permissionGuard(permission: Permission): CanActivateFn {
    return () => inject(CurrentSessionService).can(permission) || inject(Router).createUrlTree(['/auth/access']);
}
