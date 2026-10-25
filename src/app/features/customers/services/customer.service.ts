import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { toOperationResult } from '../../../core/utils/http-result.util';
import { Customer, CustomerInput, CustomerType } from '../../../shared/models/customer.model';
import { OperationResult } from '../../../shared/models/result.model';

// La API lee el enum CustomerType como número (no tiene JsonStringEnumConverter), pero lo
// devuelve como texto en CustomerDto. Solo se traduce al enviar.
const CUSTOMER_TYPE_WIRE: Readonly<Record<CustomerType, number>> = { Person: 0, Company: 1 };

// No hace falta enviar el tenant: la API lo saca del token y filtra por él (ADR-002). Un id de
// otra empresa da el mismo 404 que uno que no existe.
@Injectable({
    providedIn: 'root'
})
export class CustomerService {
    private http = inject(HttpClient);
    private url = `${environment.apiUrl}/customers`;

    list(): Observable<OperationResult<Customer[]>> {
        return toOperationResult(this.http.get<Customer[]>(this.url));
    }

    get(id: string): Observable<OperationResult<Customer>> {
        return toOperationResult(this.http.get<Customer>(`${this.url}/${encodeURIComponent(id)}`));
    }

    create(type: CustomerType, input: CustomerInput): Observable<OperationResult<string>> {
        return toOperationResult(this.http.post<{ id: string }>(this.url, { type: CUSTOMER_TYPE_WIRE[type], ...input }).pipe(map((response) => response.id)));
    }

    update(id: string, input: CustomerInput): Observable<OperationResult> {
        return toOperationResult(this.http.put<void>(`${this.url}/${encodeURIComponent(id)}`, input));
    }

    delete(id: string): Observable<OperationResult> {
        return toOperationResult(this.http.delete<void>(`${this.url}/${encodeURIComponent(id)}`));
    }
}
