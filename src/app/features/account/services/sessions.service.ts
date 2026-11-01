import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { toOperationResult } from '../../../core/utils/http-result.util';
import { OperationResult } from '../../../shared/models/result.model';
import { SessionInfo } from '../../../shared/models/session.model';

// Mis sesiones activas (GET /account/sessions, permiso Account.Read). Solo LEE: cerrar una sesión vive en
// AuthService.closeSession, porque cerrar la de esta pestaña obliga a borrar también lo local, igual que
// «cerrar todas».
@Injectable({
    providedIn: 'root'
})
export class SessionsService {
    private http = inject(HttpClient);

    list(): Observable<OperationResult<SessionInfo[]>> {
        return toOperationResult(this.http.get<SessionInfo[]>(`${environment.apiUrl}/account/sessions`));
    }
}
