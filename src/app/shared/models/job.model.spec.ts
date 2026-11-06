import { Job, JobStatus, SCHEDULE_LIMITS, canCancel, canComplete, canSchedule, canStart, canUnschedule, isOverdue } from './job.model';

describe('job model · schedule rules (mirror of the Job aggregate, spec 020)', () => {
    const all: JobStatus[] = ['New', 'Pending', 'Scheduled', 'InProgress', 'Completed', 'Cancelled'];
    // La regla se recibe como (s) => boolean: así TypeScript no la trata como un type guard (los tests no dependen de la inferencia de tipos).
    const pick = (rule: (status: JobStatus) => boolean): JobStatus[] => all.filter((status) => rule(status));

    it('a job can be started from New or Scheduled, and from nowhere else', () => {
        expect(pick(canStart)).toEqual(['New', 'Scheduled']);
    });

    it('only New and Scheduled can be scheduled (Scheduled means rescheduling)', () => {
        expect(pick(canSchedule)).toEqual(['New', 'Scheduled']);
    });

    it('only a Scheduled job can be taken off the agenda', () => {
        expect(pick(canUnschedule)).toEqual(['Scheduled']);
    });

    it('complete and cancel are unchanged', () => {
        expect(pick(canComplete)).toEqual(['InProgress']);
        expect(pick(canCancel)).toEqual(['New', 'Pending', 'Scheduled', 'InProgress']);
    });

    it('the duration limits are the API ones: 1 to 1440 minutes', () => {
        expect({ ...SCHEDULE_LIMITS } as Record<string, number>).toEqual({ minMinutes: 1, maxMinutes: 1440 });
    });

    describe('isOverdue', () => {
        const now = new Date(2026, 10, 10, 12, 0);
        const job = (status: JobStatus, scheduledDate: string | null): Pick<Job, 'status' | 'scheduledDate'> => ({ status, scheduledDate });
        const at = (hour: number, minute = 0) => new Date(2026, 10, 10, hour, minute).toISOString();

        it('a Scheduled job whose time has passed is overdue', () => {
            expect(isOverdue(job('Scheduled', at(9)), now)).toBeTrue();
        });

        it('a Scheduled job whose time has not come yet is not', () => {
            expect(isOverdue(job('Scheduled', at(15)), now)).toBeFalse();
        });

        it('the exact instant is not overdue yet (it is overdue from the next moment on)', () => {
            expect(isOverdue(job('Scheduled', at(12, 0)), now)).toBeFalse();
            expect(isOverdue(job('Scheduled', new Date(now.getTime() - 1).toISOString()), now)).toBeTrue();
        });

        it('a job already in progress is not overdue: it is being done, even if late', () => {
            expect(isOverdue(job('InProgress', at(9)), now)).toBeFalse();
        });

        it('a completed or cancelled job is not overdue', () => {
            expect(isOverdue(job('Completed', at(9)), now)).toBeFalse();
            expect(isOverdue(job('Cancelled', at(9)), now)).toBeFalse();
        });

        it('a job without a date is never overdue', () => {
            expect(isOverdue(job('Scheduled', null), now)).toBeFalse();
            expect(isOverdue(job('New', null), now)).toBeFalse();
        });
    });
});
