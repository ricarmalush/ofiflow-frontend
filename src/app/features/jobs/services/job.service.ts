import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { toOperationResult } from '../../../core/utils/http-result.util';
import { Job, JobInput, JobPriority } from '../../../shared/models/job.model';
import { OperationResult } from '../../../shared/models/result.model';

// Como CustomerType: la API lee JobPriority como número y lo devuelve como texto.
const JOB_PRIORITY_WIRE: Readonly<Record<JobPriority, number>> = { Low: 0, Normal: 1, High: 2, Urgent: 3 };

export type JobTransition = 'start' | 'complete' | 'cancel';

@Injectable({
    providedIn: 'root'
})
export class JobService {
    private http = inject(HttpClient);
    private url = `${environment.apiUrl}/jobs`;

    list(): Observable<OperationResult<Job[]>> {
        return toOperationResult(this.http.get<Job[]>(this.url));
    }

    get(id: string): Observable<OperationResult<Job>> {
        return toOperationResult(this.http.get<Job>(this.jobUrl(id)));
    }

    create(customerId: string, input: JobInput): Observable<OperationResult<string>> {
        const body = { customerId, ...input, priority: JOB_PRIORITY_WIRE[input.priority] };
        return toOperationResult(this.http.post<{ id: string }>(this.url, body).pipe(map((response) => response.id)));
    }

    update(id: string, input: JobInput): Observable<OperationResult> {
        return toOperationResult(this.http.put<void>(this.jobUrl(id), { ...input, priority: JOB_PRIORITY_WIRE[input.priority] }));
    }

    // Los cambios de estado son acciones (POST /start, /complete, /cancel), no un PUT del campo
    // status: así la API aplica las reglas de transición y el permiso de cada una.
    transition(id: string, transition: JobTransition): Observable<OperationResult> {
        return toOperationResult(this.http.post<void>(`${this.jobUrl(id)}/${transition}`, {}));
    }

    // La agenda: los trabajos con fecha dentro de [from, to) (spec 020). Los dos extremos son instantes UTC con la «Z» (toISOString): sin «+»
    // en la URL, que llegaría como un espacio. La API acota el rango a 42 días.
    agenda(from: string, to: string): Observable<OperationResult<Job[]>> {
        return toOperationResult(this.http.get<Job[]>(`${this.url}/agenda`, { params: { from, to } }));
    }

    // Programar o reprogramar: la fecha va como instante UTC con la «Z» y SUSTITUYE la programación entera (sin duración, se borra la anterior).
    schedule(id: string, scheduledDateUtc: string, estimatedDurationMinutes: number | null): Observable<OperationResult> {
        return toOperationResult(this.http.put<void>(`${this.jobUrl(id)}/schedule`, { scheduledDate: scheduledDateUtc, estimatedDurationMinutes }));
    }

    // Quita el trabajo de la agenda: vuelve a «Nuevo», sin fecha ni duración.
    unschedule(id: string): Observable<OperationResult> {
        return toOperationResult(this.http.delete<void>(`${this.jobUrl(id)}/schedule`));
    }

    assign(id: string, tenantUserId: string): Observable<OperationResult> {
        return toOperationResult(this.http.post<void>(`${this.jobUrl(id)}/assign`, { tenantUserId }));
    }

    private jobUrl(id: string): string {
        return `${this.url}/${encodeURIComponent(id)}`;
    }
}
