import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { toOperationResult } from '../../../core/utils/http-result.util';
import { OperationResult } from '../../../shared/models/result.model';
import { TeamMember } from '../../../shared/models/team-member.model';

// Miembros de la empresa (GET /users, permiso Users.Read). De momento solo para elegir a quién
// asignar un trabajo y poner nombre al asignado; la gestión del equipo vendrá en su pantalla.
@Injectable({
    providedIn: 'root'
})
export class TeamService {
    private http = inject(HttpClient);

    list(): Observable<OperationResult<TeamMember[]>> {
        return toOperationResult(this.http.get<TeamMember[]>(`${environment.apiUrl}/users`));
    }
}
