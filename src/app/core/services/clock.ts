import { InjectionToken } from '@angular/core';

// «Qué hora es ahora», inyectable. La agenda marca el día de hoy y los trabajos vencidos según la hora actual, y un test no puede
// depender del reloj de la máquina: provee aquí una hora fija. En la aplicación real es simplemente `new Date()`.
export const CLOCK = new InjectionToken<() => Date>('CLOCK', {
    providedIn: 'root',
    factory: () => () => new Date()
});
