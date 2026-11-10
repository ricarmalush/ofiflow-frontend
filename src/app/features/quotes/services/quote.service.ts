import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { toOperationResult } from '../../../core/utils/http-result.util';
import { PagedResult, Quote, QuoteInput, QuoteListItem, QuoteStatus, QuoteTransition } from '../../../shared/models/quote.model';
import { OperationResult } from '../../../shared/models/result.model';

// El PDF ya descargado: el fichero y el nombre que dijo la API (solo si tiene la forma esperada; si no, null y quien llama pone el suyo).
export interface QuotePdf {
    blob: Blob;
    fileName: string | null;
}

// El nombre que la API da a la descarga (spec 025 R15, D11) es solo el número: «presupuesto-P-0012.pdf». No se usa nada que no tenga exactamente esa forma: un nombre de fichero que venga
// de fuera no puede llevar una ruta, una extensión ni texto de nadie.
const PDF_FILE_NAME = /^presupuesto-P-\d{4,10}\.pdf$/;

export function pdfFileNameFrom(contentDisposition: string | null): string | null {
    if (!contentDisposition) {
        return null;
    }
    for (const part of contentDisposition.split(';')) {
        const [key, ...rest] = part.trim().split('=');
        if (key.toLowerCase() === 'filename') {
            const value = rest.join('=').trim().replace(/^"|"$/g, '');
            return PDF_FILE_NAME.test(value) ? value : null;
        }
    }
    return null;
}

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

    // Descarga el PDF del presupuesto GUARDADO (spec 025). Va con la sesión de siempre (el interceptor), nunca con el token en la URL, y no se guarda en ningún almacenamiento. Si la API
    // contesta con un error (un 400 con su código, un 404, un 429), el cuerpo llega como un problema normal (el interceptor lee el Blob). Una respuesta que no es un PDF es un fallo.
    downloadPdf(id: string): Observable<OperationResult<QuotePdf>> {
        return toOperationResult(
            this.http.get(`${this.quoteUrl(id)}/pdf`, { responseType: 'blob', observe: 'response' }).pipe(
                map((response) => {
                    const blob = response.body;
                    if (!blob || !blob.type.startsWith('application/pdf')) {
                        throw new Error('La respuesta no es un PDF.');
                    }
                    return { blob, fileName: pdfFileNameFrom(response.headers.get('Content-Disposition')) };
                })
            )
        );
    }

    private quoteUrl(id: string): string {
        return `${this.url}/${encodeURIComponent(id)}`;
    }
}
