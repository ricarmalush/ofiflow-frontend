import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { toOperationResult } from '../../../core/utils/http-result.util';
import { OperationResult } from '../../../shared/models/result.model';

// Cambiar la contraseña estando dentro (PUT /account/password, permiso Account.ChangePassword, que tienen los cinco roles; spec 019). Exige la contraseña ACTUAL y, si la
// cuenta tiene el segundo factor, un código: una sesión robada no basta para dejar fuera a su dueño. La API cierra todas las OTRAS sesiones y conserva esta: no hay que volver a entrar.
@Injectable({
    providedIn: 'root'
})
export class PasswordService {
    private http = inject(HttpClient);
    private url = `${environment.apiUrl}/account/password`;

    // El código solo se manda si hay uno: sin segundo factor la API ignora el campo, y un valor vacío no debe viajar.
    change(currentPassword: string, newPassword: string, code?: string): Observable<OperationResult> {
        const body = code ? { currentPassword, newPassword, code } : { currentPassword, newPassword };
        return toOperationResult(this.http.put<void>(this.url, body));
    }
}
