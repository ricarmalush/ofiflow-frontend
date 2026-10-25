import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { toOperationResult } from '../../../core/utils/http-result.util';
import { TenantRole } from '../../../shared/models/auth.model';
import { OperationResult } from '../../../shared/models/result.model';
import { Invitation, InvitationCreated, TENANT_ROLE_WIRE, TeamMember } from '../../../shared/models/team-member.model';

// Miembros (/users) e invitaciones (/invitations) de la empresa. Leer exige Users.Read; todo lo
// demás, Users.Manage más la jerarquía de roles, que la API comprueba en cada petición.
@Injectable({
    providedIn: 'root'
})
export class TeamService {
    private http = inject(HttpClient);
    private usersUrl = `${environment.apiUrl}/users`;
    private invitationsUrl = `${environment.apiUrl}/invitations`;

    list(): Observable<OperationResult<TeamMember[]>> {
        return toOperationResult(this.http.get<TeamMember[]>(this.usersUrl));
    }

    changeRole(memberId: string, role: TenantRole): Observable<OperationResult> {
        return toOperationResult(this.http.put<void>(`${this.memberUrl(memberId)}/role`, { role: TENANT_ROLE_WIRE[role] }));
    }

    remove(memberId: string): Observable<OperationResult> {
        return toOperationResult(this.http.delete<void>(this.memberUrl(memberId)));
    }

    resetMfa(memberId: string): Observable<OperationResult> {
        return toOperationResult(this.http.delete<void>(`${this.memberUrl(memberId)}/mfa`));
    }

    listInvitations(): Observable<OperationResult<Invitation[]>> {
        return toOperationResult(this.http.get<Invitation[]>(this.invitationsUrl));
    }

    invite(email: string, role: TenantRole): Observable<OperationResult<InvitationCreated>> {
        return toOperationResult(this.http.post<InvitationCreated>(this.invitationsUrl, { email, role: TENANT_ROLE_WIRE[role] }));
    }

    revokeInvitation(invitationId: string): Observable<OperationResult> {
        return toOperationResult(this.http.delete<void>(`${this.invitationsUrl}/${encodeURIComponent(invitationId)}`));
    }

    private memberUrl(memberId: string): string {
        return `${this.usersUrl}/${encodeURIComponent(memberId)}`;
    }
}
