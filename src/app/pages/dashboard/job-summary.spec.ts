import { Job, JobPriority, JobStatus } from '../../shared/models/job.model';
import { ATTENTION_LIMIT, isOpen, percentOf, summarizeJobs } from './job-summary';

let sequence = 0;
function job(status: JobStatus, priority: JobPriority = 'Normal', overrides: Partial<Job> = {}): Job {
    sequence++;
    return {
        id: `job-${sequence}`,
        customerId: 'customer-1',
        title: `Trabajo ${sequence}`,
        description: null,
        status,
        priority,
        scheduledDate: null,
        assignedTenantUserId: null,
        estimatedDurationMinutes: null,
        ...overrides
    };
}

describe('summarizeJobs', () => {
    it('is all zeros and an empty attention list for no jobs (a new company)', () => {
        const summary = summarizeJobs([]);

        expect(summary.total).toBe(0);
        expect(summary.open).toBe(0);
        expect(summary.inProgress).toBe(0);
        expect(summary.unassigned).toBe(0);
        expect(summary.highPriority).toBe(0);
        expect(summary.attention).toEqual([]);
        expect(Object.values(summary.byStatus).every((count) => count === 0)).toBeTrue();
    });

    it('counts every status in the breakdown and the total across all of them', () => {
        const summary = summarizeJobs([job('New'), job('New'), job('Pending'), job('Scheduled'), job('InProgress'), job('Completed'), job('Completed'), job('Cancelled')]);

        expect(summary.byStatus).toEqual({ New: 2, Pending: 1, Scheduled: 1, InProgress: 1, Completed: 2, Cancelled: 1 });
        expect(summary.total).toBe(8);
    });

    it('treats New, Pending, Scheduled and InProgress as open, and Completed and Cancelled as finished', () => {
        expect((['New', 'Pending', 'Scheduled', 'InProgress'] as JobStatus[]).map((s) => isOpen(job(s)))).toEqual([true, true, true, true]);
        expect((['Completed', 'Cancelled'] as JobStatus[]).map((s) => isOpen(job(s)))).toEqual([false, false]);
        expect(summarizeJobs([job('New'), job('InProgress'), job('Completed'), job('Cancelled')]).open).toBe(2);
    });

    it('counts as unassigned only OPEN jobs nobody has (a finished job without assignee is history, not work to hand out)', () => {
        const summary = summarizeJobs([
            job('New'), // sin asignar y abierto
            job('InProgress', 'Normal', { assignedTenantUserId: 'member-1' }),
            job('Completed'), // sin asignar pero terminado
            job('Cancelled')
        ]);

        expect(summary.unassigned).toBe(1);
    });

    it('counts high priority among the open ones only, and High and Urgent both count', () => {
        const summary = summarizeJobs([job('New', 'High'), job('InProgress', 'Urgent'), job('Completed', 'Urgent'), job('Cancelled', 'High'), job('New', 'Low'), job('New', 'Normal')]);

        expect(summary.highPriority).toBe(2);
    });

    describe('the attention list', () => {
        it('has only open High or Urgent jobs', () => {
            const summary = summarizeJobs([job('New', 'Normal'), job('New', 'Low'), job('Completed', 'Urgent'), job('Cancelled', 'High'), job('New', 'High')]);

            expect(summary.attention.length).toBe(1);
            expect(summary.attention[0].priority).toBe('High');
        });

        it('puts Urgent before High, and within the same priority the ones already in progress first', () => {
            const high = job('New', 'High', { title: 'A alta nueva' });
            const highInProgress = job('InProgress', 'High', { title: 'B alta en curso' });
            const urgent = job('Pending', 'Urgent', { title: 'C urgente pendiente' });
            const urgentInProgress = job('InProgress', 'Urgent', { title: 'D urgente en curso' });

            const titles = summarizeJobs([high, highInProgress, urgent, urgentInProgress]).attention.map((j) => j.title);

            expect(titles).toEqual(['D urgente en curso', 'C urgente pendiente', 'B alta en curso', 'A alta nueva']);
        });

        it('breaks the remaining ties by title so the order never changes between loads', () => {
            const titles = summarizeJobs([job('New', 'High', { title: 'Zócalo' }), job('New', 'High', { title: 'Árbol' }), job('New', 'High', { title: 'Mesa' })]).attention.map((j) => j.title);

            expect(titles).toEqual(['Árbol', 'Mesa', 'Zócalo']);
        });

        it('is cut at the limit, but the counters still count all of them', () => {
            const many = Array.from({ length: ATTENTION_LIMIT + 5 }, () => job('New', 'Urgent'));

            const summary = summarizeJobs(many);

            expect(summary.attention.length).toBe(ATTENTION_LIMIT);
            expect(summary.highPriority).toBe(ATTENTION_LIMIT + 5);
        });
    });

    it('does not reorder or modify the array it receives', () => {
        const jobs = [job('New', 'High', { title: 'B' }), job('New', 'Urgent', { title: 'A' })];
        const before = jobs.map((j) => j.id);

        summarizeJobs(jobs);

        expect(jobs.map((j) => j.id)).toEqual(before);
    });

    it('survives a status the frontend does not know yet: it counts in the total but not in the breakdown', () => {
        const unknown = job('New', 'Normal', { status: 'Archived' as JobStatus });

        const summary = summarizeJobs([unknown, job('New')]);

        expect(summary.total).toBe(2);
        expect(Object.values(summary.byStatus).reduce((a, b) => a + b, 0)).toBe(1);
    });
});

describe('percentOf', () => {
    it('rounds to a whole percent', () => {
        expect(percentOf(1, 3)).toBe(33);
        expect(percentOf(2, 3)).toBe(67);
    });

    it('is 0 when there is nothing to share (never NaN)', () => {
        expect(percentOf(0, 0)).toBe(0);
        expect(percentOf(5, 0)).toBe(0);
    });

    it('never leaves the 0-100 range', () => {
        expect(percentOf(7, 5)).toBe(100);
        expect(percentOf(-3, 5)).toBe(0);
    });
});

describe('summarizeJobs · assigned to me', () => {
    const me = 'membership-me';

    it('counts only OPEN jobs assigned to my membership', () => {
        const summary = summarizeJobs(
            [
                job('InProgress', 'Normal', { assignedTenantUserId: me }),
                job('New', 'Normal', { assignedTenantUserId: me }),
                job('Completed', 'Normal', { assignedTenantUserId: me }), // mío pero ya terminado: historia, no trabajo pendiente
                job('New', 'Normal', { assignedTenantUserId: 'someone-else' }),
                job('New') // sin asignar
            ],
            me
        );

        expect(summary.assignedToMe).toBe(2);
    });

    it('is 0 when my membership is not known (never guesses which jobs are mine)', () => {
        const jobs = [job('New', 'Normal', { assignedTenantUserId: me }), job('New')];

        expect(summarizeJobs(jobs).assignedToMe).toBe(0);
        expect(summarizeJobs(jobs, null).assignedToMe).toBe(0);
        expect(summarizeJobs(jobs, '').assignedToMe).toBe(0);
    });

    it('does not count unassigned jobs as mine even if the id is empty', () => {
        expect(summarizeJobs([job('New', 'Normal', { assignedTenantUserId: null })], me).assignedToMe).toBe(0);
    });
});
