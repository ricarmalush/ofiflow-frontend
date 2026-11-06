import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { ConfirmationService, MessageService } from 'primeng/api';
import { CLOCK } from '../../../../core/services/clock';
import { environment } from '../../../../../environments/environment';
import { CurrentSessionService } from '../../../../core/services/current-session';
import { buildAccount } from '../../../../core/testing/fake-account';
import { buildSessionToken } from '../../../../core/testing/fake-jwt';
import { CurrentAccount } from '../../../../shared/models/account.model';
import { TenantRole } from '../../../../shared/models/auth.model';
import { Job, JobStatus } from '../../../../shared/models/job.model';
import { JobListComponent } from './job-list.component';

const jobsUrl = `${environment.apiUrl}/jobs`;
const customersUrl = `${environment.apiUrl}/customers`;
const usersUrl = `${environment.apiUrl}/users`;

const ME = 'membership-me';
const job = (id: string, title: string, status: JobStatus, assignedTenantUserId: string | null): Job => ({
    id,
    customerId: 'c1',
    title,
    description: null,
    status,
    priority: 'Normal',
    scheduledDate: null,
    assignedTenantUserId,
    estimatedDurationMinutes: null
});

describe('JobListComponent · my jobs', () => {
    let httpMock: HttpTestingController;
    let harness: RouterTestingHarness;

    // Abre /jobs (con o sin ?mine=1) con el rol y la cuenta indicados, y responde a las peticiones del listado.
    async function open(role: TenantRole, query = '', account: Partial<CurrentAccount> | null = {}): Promise<HTMLElement> {
        const session = TestBed.inject(CurrentSessionService);
        session.establish(buildSessionToken());
        if (account) {
            session.setAccount(buildAccount({ role, membershipId: ME, ...account }));
        }

        harness = await RouterTestingHarness.create();
        // Al terminar la navegación el componente ya existe y ha lanzado sus peticiones (ngOnInit).
        await harness.navigateByUrl(`/jobs${query}`, JobListComponent);
        httpMock.expectOne(jobsUrl).flush([job('j1', 'Mío', 'Scheduled', ME), job('j2', 'De Luis', 'New', 'membership-luis'), job('j3', 'Sin dueño', 'New', null)]);
        httpMock.expectOne(customersUrl).flush([{ id: 'c1', type: 'Person', name: 'Marta', email: null, phone: null, address: null, notes: null }]);
        const users = httpMock.match(usersUrl);
        users.forEach((request) => request.flush([{ id: 'membership-luis', name: 'Luis', email: 'luis@x.com', role: 'Technician', isActive: true }]));
        harness.detectChanges();
        return harness.routeNativeElement as HTMLElement;
    }

    const titles = (host: HTMLElement) => Array.from(host.querySelectorAll('tbody tr td:first-child')).map((cell) => cell.textContent?.trim());
    // aria-pressed vive en el <p-button> anfitrión; el clic se da en su <button> interno.
    const mineHost = (host: HTMLElement) => Array.from(host.querySelectorAll('p-button')).find((button) => button.textContent?.includes('Solo mis trabajos'));
    const mineButton = (host: HTMLElement) => mineHost(host)?.querySelector('button');

    beforeEach(() => {
        TestBed.configureTestingModule({
            providers: [provideRouter([{ path: 'jobs', component: JobListComponent }]), provideHttpClient(), provideHttpClientTesting(), MessageService, ConfirmationService]
        });
        httpMock = TestBed.inject(HttpTestingController);
    });

    afterEach(() => httpMock.verify());

    it('shows every job by default and labels MY jobs as "Tú" (even for a role that cannot list the team)', async () => {
        const host = await open('Technician');

        expect(titles(host)).toEqual(['Mío', 'De Luis', 'Sin dueño']);
        // El técnico no tiene Users.Read: el compañero se queda como «Asignado», sin nombre.
        const assignees = Array.from(host.querySelectorAll('tbody tr td:nth-child(5)')).map((cell) => cell.textContent?.trim());
        expect(assignees).toEqual(['Tú', 'Asignado', 'Sin asignar']);
    });

    it('arrives filtered to my jobs when it comes from the dashboard tile (?mine=1)', async () => {
        const host = await open('Technician', '?mine=1');

        expect(titles(host)).toEqual(['Mío']);
        expect(mineHost(host)?.getAttribute('aria-pressed')).toBe('true');
    });

    it('the "Solo mis trabajos" button toggles the filter', async () => {
        const host = await open('Technician');
        expect(mineHost(host)?.getAttribute('aria-pressed')).toBe('false');

        mineButton(host)?.click();
        harness.detectChanges();
        expect(titles(host)).toEqual(['Mío']);

        mineButton(host)?.click();
        harness.detectChanges();
        expect(titles(host)).toEqual(['Mío', 'De Luis', 'Sin dueño']);
    });

    it('without a membership id there is no "mine" button and ?mine=1 shows nothing instead of guessing', async () => {
        const host = await open('Technician', '?mine=1', { membershipId: '' });

        expect(mineButton(host)).toBeUndefined();
        expect(titles(host).filter((title) => title && !title.startsWith('No hay'))).toEqual([]);
    });

    it('the action buttons follow a role change WITHOUT navigating (the account is reloaded after a 403)', async () => {
        const host = await open('Technician');
        const labels = () => Array.from(host.querySelectorAll('tbody tr button')).map((button) => button.getAttribute('aria-label'));
        expect(labels()).toContain('Iniciar');
        expect(labels()).not.toContain('Editar');

        // Lo que hace AccountService.load() cuando el interceptor ve un 403 auth.forbidden: llega la cuenta nueva.
        TestBed.inject(CurrentSessionService).setAccount(buildAccount({ role: 'Employee', membershipId: ME }));
        harness.detectChanges();

        expect(labels()).not.toContain('Iniciar');
        expect(labels()).toContain('Editar');
    });

    it('with no account loaded at all (membership null) ?mine=1 does not turn the UNASSIGNED jobs into "mine"', async () => {
        const host = await open('Technician', '?mine=1', null);

        expect(mineButton(host)).toBeUndefined();
        expect(titles(host).filter((title) => title && !title.startsWith('No hay'))).toEqual([]);
    });
});

// La columna «Programado» y el «Iniciar» de un trabajo programado (spec 020 F4 y F6).
describe('JobListComponent · schedule column', () => {
    let httpMock: HttpTestingController;
    let harness: RouterTestingHarness;
    const NOW = new Date(2026, 10, 11, 10, 0);
    const local = (day: number, hour: number, minute = 0) => new Date(2026, 10, day, hour, minute).toISOString();

    async function open(role: TenantRole, jobs: Job[]): Promise<HTMLElement> {
        const session = TestBed.inject(CurrentSessionService);
        session.establish(buildSessionToken());
        session.setAccount(buildAccount({ role, membershipId: ME }));

        harness = await RouterTestingHarness.create();
        await harness.navigateByUrl('/jobs', JobListComponent);
        httpMock.expectOne(jobsUrl).flush(jobs);
        httpMock.expectOne(customersUrl).flush([{ id: 'c1', type: 'Person', name: 'Marta', email: null, phone: null, address: null, notes: null }]);
        httpMock.match(usersUrl).forEach((request) => request.flush([]));
        harness.detectChanges();
        return harness.routeNativeElement as HTMLElement;
    }

    const withDate = (id: string, title: string, status: JobStatus, scheduledDate: string | null): Job => ({ ...job(id, title, status, null), scheduledDate });
    const row = (host: HTMLElement, title: string) => Array.from(host.querySelectorAll('tbody tr')).find((tr) => tr.querySelector('td')?.textContent?.trim() === title) as HTMLElement;
    const scheduledCell = (host: HTMLElement, title: string) => row(host, title).querySelector('td:nth-child(6)') as HTMLElement;
    const labels = (host: HTMLElement, title: string) => Array.from(row(host, title).querySelectorAll('button')).map((button) => button.getAttribute('aria-label'));

    beforeEach(() => {
        TestBed.configureTestingModule({
            providers: [
                provideRouter([{ path: 'jobs', component: JobListComponent }]),
                provideHttpClient(),
                provideHttpClientTesting(),
                MessageService,
                ConfirmationService,
                { provide: CLOCK, useValue: () => NOW }
            ]
        });
        httpMock = TestBed.inject(HttpTestingController);
    });

    afterEach(() => httpMock.verify());

    it('shows the scheduled date in the browser time, day/month/year and 24-hour time', async () => {
        const host = await open('Manager', [withDate('j1', 'Con fecha', 'Scheduled', local(12, 9, 5))]);

        expect(scheduledCell(host, 'Con fecha').textContent).toContain('12/11/2026 09:05');
    });

    it('shows a dash when there is no date', async () => {
        const host = await open('Manager', [withDate('j1', 'Sin fecha', 'New', null)]);

        expect(scheduledCell(host, 'Sin fecha').textContent?.trim()).toBe('—');
    });

    it('marks "Vencido" only a scheduled job whose time has passed', async () => {
        const host = await open('Manager', [
            withDate('j1', 'Vencido', 'Scheduled', local(10, 9)),
            withDate('j2', 'Futuro', 'Scheduled', local(12, 9)),
            withDate('j3', 'En curso', 'InProgress', local(10, 9)),
            withDate('j4', 'Hecho', 'Completed', local(10, 9))
        ]);

        const overdue = ['Vencido', 'Futuro', 'En curso', 'Hecho'].filter((title) => scheduledCell(host, title).textContent?.includes('Vencido'));
        expect(overdue).toEqual(['Vencido']);
    });

    it('offers "Iniciar" for a scheduled job as well as for a new one, and not for one in progress', async () => {
        const host = await open('Technician', [withDate('j1', 'Nuevo', 'New', null), withDate('j2', 'Programado', 'Scheduled', local(12, 9)), withDate('j3', 'En curso', 'InProgress', local(10, 9))]);

        expect(labels(host, 'Nuevo')).toContain('Iniciar');
        expect(labels(host, 'Programado')).toContain('Iniciar');
        expect(labels(host, 'En curso')).not.toContain('Iniciar');
        expect(labels(host, 'En curso')).toContain('Completar');
    });

    it('starting a scheduled job calls its start action and shows what the API stored', async () => {
        const host = await open('Technician', [withDate('j1', 'Programado', 'Scheduled', local(12, 9))]);

        (row(host, 'Programado').querySelector('button[aria-label="Iniciar"]') as HTMLButtonElement).click();
        const start = httpMock.expectOne(`${jobsUrl}/j1/start`);
        expect(start.request.method).toBe('POST');
        start.flush(null, { status: 204, statusText: 'No Content' });
        httpMock.expectOne(`${jobsUrl}/j1`).flush(withDate('j1', 'Programado', 'InProgress', local(12, 9)));
        harness.detectChanges();

        expect(labels(host, 'Programado')).not.toContain('Iniciar');
        expect(labels(host, 'Programado')).toContain('Completar');
        expect(scheduledCell(host, 'Programado').textContent).toContain('12/11/2026 09:00'); // conserva la fecha
    });

    it('the empty-list message spans the new column too', async () => {
        const host = await open('Manager', []);

        const cell = host.querySelector('tbody td[colspan]') as HTMLElement;
        expect(cell.getAttribute('colspan')).toBe('7');
        expect(host.querySelectorAll('thead th').length).toBe(7);
    });
});
