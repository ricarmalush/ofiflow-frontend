import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, finalize, map, of, shareReplay, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { CurrentAccount } from '../../shared/models/account.model';
import { CurrentSessionService } from './current-session';

// Pide a la API quién soy, mi empresa, mi rol EFECTIVO y mis permisos (GET /account/me, spec 012) y
// lo deja en CurrentSessionService. Sustituye a decodificar el rol del token y a copiar la tabla de
// permisos: el token puede decir "Technician" 30 minutos después de que un gestor te hiciera
// "Manager", y la API ya decide con el rol nuevo; aquí también.
@Injectable({
    providedIn: 'root'
})
export class AccountService {
    private http = inject(HttpClient);
    private currentSession = inject(CurrentSessionService);
    private url = `${environment.apiUrl}/account/me`;

    // La petición en curso, compartida: el guardián, el interceptor y la renovación de sesión pueden pedirla a la vez.
    private loadInFlight: Observable<boolean> | null = null;

    // Pide la cuenta. true si llegó (y ya está en la sesión); false si no se pudo. Un fallo NO borra la
    // cuenta que ya hubiera: es mejor una interfaz algo desfasada que dejar a alguien sin ningún permiso por un corte de red.
    load(): Observable<boolean> {
        this.loadInFlight ??= this.http.get<CurrentAccount>(this.url).pipe(
            tap((account) => this.currentSession.setAccount(account)),
            map(() => true),
            catchError(() => of(false)),
            finalize(() => (this.loadInFlight = null)),
            shareReplay(1)
        );
        return this.loadInFlight;
    }

    // Para quien necesita la cuenta antes de seguir (el guardián de la zona privada): no repite la petición si ya está.
    ensureLoaded(): Observable<boolean> {
        return this.currentSession.account() ? of(true) : this.load();
    }
}
