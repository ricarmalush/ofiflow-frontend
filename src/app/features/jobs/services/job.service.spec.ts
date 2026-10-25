import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../../environments/environment';
import { canCancel, canComplete, canStart } from '../../../shared/models/job.model';
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

describe('job transitions (mirror of the Job aggregate)', () => {
    it('only a new job can be started', () => {
        expect(canStart('New')).toBeTrue();
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
