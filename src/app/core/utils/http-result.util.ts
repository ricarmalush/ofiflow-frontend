import { HttpErrorResponse } from '@angular/common/http';
import { Observable, catchError, map, of } from 'rxjs';
import { ProblemDetails } from '../../shared/models/problem-details.model';
import { OperationResult } from '../../shared/models/result.model';
import { NETWORK_ERROR_MESSAGE, UNEXPECTED_ERROR_MESSAGE } from '../constants/service-messages';

// El cuerpo solo es un ProblemDetails si la API llegó a responder con JSON; con status 0 (sin
// red, CORS) o un proxy que devuelve HTML, error.error es otra cosa y no se lee como tal.
function readProblem(error: HttpErrorResponse): ProblemDetails | undefined {
    return typeof error.error === 'object' && error.error !== null ? (error.error as ProblemDetails) : undefined;
}

export function extractErrorMessage(error: HttpErrorResponse): string {
    return readProblem(error)?.detail || (error.status === 0 ? NETWORK_ERROR_MESSAGE : UNEXPECTED_ERROR_MESSAGE);
}

// Los segundos de «Retry-After» (un 429): solo un número entero positivo y razonable; cualquier otra cosa (una fecha, un texto, un número enorme) se ignora.
function readRetryAfter(error: HttpErrorResponse): number | undefined {
    const value = error.headers?.get('Retry-After');
    if (!value || !/^\d{1,6}$/.test(value)) {
        return undefined;
    }
    const seconds = Number(value);
    return seconds > 0 ? seconds : undefined;
}

// Normaliza cualquier llamada a la API a un OperationResult que nunca lanza.
export function toOperationResult<T = void>(source: Observable<T>): Observable<OperationResult<T>> {
    return source.pipe(
        map((data) => ({ isSuccess: true, message: '', data }) as OperationResult<T>),
        catchError((error: HttpErrorResponse) => {
            const problem = readProblem(error);
            return of<OperationResult<T>>({
                isSuccess: false,
                message: extractErrorMessage(error),
                code: problem?.code,
                fieldErrors: problem?.errors,
                retryAfterSeconds: readRetryAfter(error)
            });
        })
    );
}
