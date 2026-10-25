import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { toOperationResult } from '../../../core/utils/http-result.util';
import { MfaSetup, MfaStatus, RecoveryCodes } from '../../../shared/models/mfa.model';
import { OperationResult } from '../../../shared/models/result.model';

// El segundo factor de la propia cuenta (/account/mfa, permiso Mfa.Manage, que tienen los cinco
// roles). Todo lo que cambia algo exige la contraseña, y desactivar o regenerar exige además un
// código: un token de sesión robado no basta para quitar la protección.
@Injectable({
    providedIn: 'root'
})
export class MfaService {
    private http = inject(HttpClient);
    private url = `${environment.apiUrl}/account/mfa`;

    status(): Observable<OperationResult<MfaStatus>> {
        return toOperationResult(this.http.get<MfaStatus>(this.url));
    }

    startSetup(password: string): Observable<OperationResult<MfaSetup>> {
        return toOperationResult(this.http.post<MfaSetup>(`${this.url}/setup`, { password }));
    }

    // Al activarlo, la API cierra todas las sesiones de la cuenta (también esta).
    enable(code: string): Observable<OperationResult<RecoveryCodes>> {
        return toOperationResult(this.http.post<RecoveryCodes>(`${this.url}/enable`, { code }));
    }

    // Al desactivarlo, la API cierra todas las sesiones de la cuenta (también esta).
    disable(password: string, code: string): Observable<OperationResult> {
        return toOperationResult(this.http.post<void>(`${this.url}/disable`, { password, code }));
    }

    regenerateRecoveryCodes(password: string, code: string): Observable<OperationResult<RecoveryCodes>> {
        return toOperationResult(this.http.post<RecoveryCodes>(`${this.url}/recovery-codes`, { password, code }));
    }
}
