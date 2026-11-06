import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../../environments/environment';
import { Job, canCancel, canComplete, canStart } from '../../../shared/models/job.model';
import { OperationResult } from '../../../shared/models/result.model';
import { JobService } from './job.service';

describe('JobService', () => {
    let service: JobService;
    let httpMock: HttpTestingController;
    const url = `${environment.apiUrl}/jobs`;

    beforeEach(() => {
        TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
        service = TestBed.inject(JobService);
        httpMock = TestBed.inject(HttpTestingController);
    });

    afterEach(() => httpMock.verify());

    it('creates a job with the priority as the number the API enum expects', () => {
        let result: OperationResult<string> | undefined;
        service.create('cust-1', { title: 'Cambiar caldera', description: null, priority: 'Urgent' }).subscribe((r) => (result = r));

        const req = httpMock.expectOne(url);
        expect(req.request.body).toEqual({ customerId: 'cust-1', title: 'Cambiar caldera', description: null, priority: 3 });
        req.flush({ id: 'job-1' }, { status: 201, statusText: 'Created' });

        expect(result?.data).toBe('job-1');
    });

    for (const transition of ['start', 'complete', 'cancel'] as const) {
        it(`${transition} is a POST to its own action, not a PUT of the status`, () => {
            service.transition('job-1', transition).subscribe();

            const req = httpMock.expectOne(`${url}/job-1/${transition}`);
            expect(req.request.method).toBe('POST');
            req.flush(null, { status: 204, statusText: 'No Content' });
        });
    }

    it('surfaces the API message when a transition is not allowed', () => {
        let result: OperationResult | undefined;
        service.transition('job-1', 'complete').subscribe((r) => (result = r));

        httpMock.expectOne(`${url}/job-1/complete`).flush({ status: 400, detail: 'Solo se puede completar un trabajo en curso.', code: 'job.cannot_complete' }, { status: 400, statusText: 'Bad Request' });

        expect(result?.isSuccess).toBeFalse();
        expect(result?.message).toBe('Solo se puede completar un trabajo en curso.');
    });

    it('assigns to a team member by its tenant user id', () => {
        service.assign('job-1', 'tu-9').subscribe();

        const req = httpMock.expectOne(`${url}/job-1/assign`);
        expect(req.request.body).toEqual({ tenantUserId: 'tu-9' });
        req.flush(null, { status: 204, statusText: 'No Content' });
    });
});

describe('JobService · schedule and agenda (spec 020)', () => {
    let service: JobService;
    let httpMock: HttpTestingController;
    const url = `${environment.apiUrl}/jobs`;

    beforeEach(() => {
        TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
        service = TestBed.inject(JobService);
        httpMock = TestBed.inject(HttpTestingController);
    });

    afterEach(() => httpMock.verify());

    it('schedules with a PUT of the UTC instant and the duration, replacing the whole programming', () => {
        service.schedule('job-1', '2026-11-10T08:00:00.000Z', 90).subscribe();

        const req = httpMock.expectOne(`${url}/job-1/schedule`);
        expect(req.request.method).toBe('PUT');
        expect(req.request.body).toEqual({ scheduledDate: '2026-11-10T08:00:00.000Z', estimatedDurationMinutes: 90 });
        req.flush(null, { status: 204, statusText: 'No Content' });
    });

    it('sends a null duration when there is none (so the API erases the old one)', () => {
        service.schedule('job-1', '2026-11-10T08:00:00.000Z', null).subscribe();

        const req = httpMock.expectOne(`${url}/job-1/schedule`);
        expect(req.request.body).toEqual({ scheduledDate: '2026-11-10T08:00:00.000Z', estimatedDurationMinutes: null });
        req.flush(null, { status: 204, statusText: 'No Content' });
    });

    it('encodes the job id in the schedule URL', () => {
        service.schedule('a/b', '2026-11-10T08:00:00.000Z', null).subscribe();

        httpMock.expectOne(`${url}/a%2Fb/schedule`).flush(null, { status: 204, statusText: 'No Content' });
    });

    it('takes a job off the agenda with a DELETE of its schedule', () => {
        service.unschedule('job-1').subscribe();

        const req = httpMock.expectOne(`${url}/job-1/schedule`);
        expect(req.request.method).toBe('DELETE');
        req.flush(null, { status: 204, statusText: 'No Content' });
    });

    it('asks the agenda for a range with from and to as query parameters', () => {
        let result: OperationResult<Job[]> | undefined;
        service.agenda('2026-11-08T23:00:00.000Z', '2026-11-15T23:00:00.000Z').subscribe((r) => (result = r));

        const req = httpMock.expectOne((request) => request.url === `${url}/agenda`);
        expect(req.request.method).toBe('GET');
        expect(req.request.params.get('from')).toBe('2026-11-08T23:00:00.000Z');
        expect(req.request.params.get('to')).toBe('2026-11-15T23:00:00.000Z');
        req.flush([{ id: 'j1' }]);

        expect(result?.isSuccess).toBeTrue();
        expect(result?.data?.length).toBe(1);
    });

    it('never puts a plus sign in the agenda URL (the range always travels as UTC with the Z)', () => {
        service.agenda(new Date(2026, 10, 9).toISOString(), new Date(2026, 10, 16).toISOString()).subscribe();

        const req = httpMock.expectOne((request) => request.url === `${url}/agenda`);
        expect(req.request.urlWithParams).not.toContain('+');
        req.flush([]);
    });

    it('surfaces the API message when the range is rejected', () => {
        let result: OperationResult<Job[]> | undefined;
        service.agenda('2026-11-15T23:00:00.000Z', '2026-11-08T23:00:00.000Z').subscribe((r) => (result = r));

        httpMock
            .expectOne((request) => request.url === `${url}/agenda`)
            .flush({ status: 400, code: 'validation.failed', detail: 'Uno o más campos no son válidos.' }, { status: 400, statusText: 'Bad Request' });

        expect(result?.isSuccess).toBeFalse();
        expect(result?.message).toBe('Uno o más campos no son válidos.');
    });

    it('surfaces the field errors when the API rejects a schedule', () => {
        let result: OperationResult | undefined;
        service.schedule('job-1', '2026-11-10T08:00:00.000Z', 1441).subscribe((r) => (result = r));

        httpMock.expectOne(`${url}/job-1/schedule`).flush(
            { status: 400, code: 'validation.failed', detail: 'No válido.', errors: [{ field: 'EstimatedDurationMinutes', code: 'job.estimated_duration_invalid', message: 'La duración debe ser entre 1 y 1440.' }] },
            { status: 400, statusText: 'Bad Request' }
        );

        expect(result?.isSuccess).toBeFalse();
        expect(result?.fieldErrors?.[0].field).toBe('EstimatedDurationMinutes');
    });
});

describe('job transitions (mirror of the Job aggregate)', () => {
    it('a new or a scheduled job can be started', () => {
        expect(canStart('New')).toBeTrue();
        expect(canStart('Scheduled')).toBeTrue();
        expect(canStart('InProgress')).toBeFalse();
    });

    it('only a job in progress can be completed', () => {
        expect(canComplete('InProgress')).toBeTrue();
        expect(canComplete('New')).toBeFalse();
    });

    it('anything but a completed or already cancelled job can be cancelled', () => {
        expect(canCancel('New')).toBeTrue();
        expect(canCancel('InProgress')).toBeTrue();
        expect(canCancel('Completed')).toBeFalse();
        expect(canCancel('Cancelled')).toBeFalse();
    });
});
