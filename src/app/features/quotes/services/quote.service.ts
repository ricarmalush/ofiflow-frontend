import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { toOperationResult } from '../../../core/utils/http-result.util';
import { PagedResult, Quote, QuoteInput, QuoteListItem, QuoteStatus, QuoteTransition } from '../../../shared/models/quote.model';
import { OperationResult } from '../../../shared/models/result.model';

export interface QuoteListFilter {
    status: QuoteStatus | null;
    customerId: string | null;
    page: number;
    pageSize: number;
}

// Los presupuestos (spec 023). La API calcula SIEMPRE el neto, el IVA y el total, y asigna el número: aquí nunca se manda un importe calculado. La empresa sale del token
// (ADR-002): un presupuesto, un cliente o un trabajo de otra empresa da el mismo 404 que uno que no existe.
@Injectable({
    providedIn: 'root'
})
export class QuoteService {
    private http = inject(HttpClient);
    private url = `${environment.apiUrl}/quotes`;

    // El listado va paginado en el servidor (hasta 100 por página) y sin las líneas. Un filtro vacío no viaja.
    list(filter: QuoteListFilter): Observable<OperationResult<PagedResult<QuoteListItem>>> {
        let params = new HttpParams().set('page', filter.page).set('pageSize', filter.pageSize);
        if (filter.status) {
            params = params.set('status', filter.status);
        }
        if (filter.customerId) {
            params = params.set('customerId', filter.customerId);
        }
        return toOperationResult(this.http.get<PagedResult<QuoteListItem>>(this.url, { params }));
    }

    get(id: string): Observable<OperationResult<Quote>> {
        return toOperationResult(this.http.get<Quote>(this.quoteUrl(id)));
    }

    create(customerId: string, input: QuoteInput): Observable<OperationResult<string>> {
        return toOperationResult(this.http.post<{ id: string }>(this.url, { customerId, ...input }).pipe(map((response) => response.id)));
    }

    // SUSTITUYE la cabecera y todas las líneas. Lleva la versión que se leyó: si alguien lo cambió mientras tanto, la API responde 400 quote.changed_meanwhile y no pisa nada.
    update(id: string, version: string, input: QuoteInput): Observable<OperationResult> {
        return toOperationResult(this.http.put<void>(this.quoteUrl(id), { version, ...input }));
    }

    delete(id: string): Observable<OperationResult> {
        return toOperationResult(this.http.delete<void>(this.quoteUrl(id)));
    }

    // Enviar, aceptar y rechazar son acciones (POST /send, /accept, /reject), no un PUT del estado: la API aplica las reglas de transición y el permiso Quotes.Issue.
    transition(id: string, transition: QuoteTransition): Observable<OperationResult> {
        return toOperationResult(this.http.post<void>(`${this.quoteUrl(id)}/${transition}`, {}));
    }

    private quoteUrl(id: string): string {
        return `${this.url}/${encodeURIComponent(id)}`;
    }
}
