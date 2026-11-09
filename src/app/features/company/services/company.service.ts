import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { toOperationResult } from '../../../core/utils/http-result.util';
import { CompanyProfile, CompanyProfileInput } from '../../../shared/models/company-profile.model';
import { OperationResult } from '../../../shared/models/result.model';

// El perfil fiscal de la empresa (spec 024). Solo hay uno por empresa y no tiene id: la ruta no lleva nada y la empresa sale del token en la API (ADR-002), así que ni el
// cuerpo ni la URL la mencionan.
@Injectable({
    providedIn: 'root'
})
export class CompanyService {
    private http = inject(HttpClient);
    private url = `${environment.apiUrl}/company/profile`;

    // Si la empresa no lo ha guardado todavía, la API responde 200 con todos los campos a null e isComplete=false: no es un error.
    get(): Observable<OperationResult<CompanyProfile>> {
        return toOperationResult(this.http.get<CompanyProfile>(this.url));
    }

    // Crea el perfil la primera vez y lo sustituye entero después (204 sin cuerpo): para ver el NIF normalizado hay que volver a leerlo.
    save(input: CompanyProfileInput): Observable<OperationResult> {
        return toOperationResult(this.http.put<void>(this.url, input));
    }
}
