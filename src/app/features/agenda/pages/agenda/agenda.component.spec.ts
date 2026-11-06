import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { environment } from '../../../../../environments/environment';
import { CLOCK } from '../../../../core/services/clock';
import { CurrentSessionService } from '../../../../core/services/current-session';
import { buildAccount } from '../../../../core/testing/fake-account';
import { buildSessionToken } from '../../../../core/testing/fake-jwt';
import { CurrentAccount } from '../../../../shared/models/account.model';
import { TenantRole } from '../../../../shared/models/auth.model';
import { Job } from '../../../../shared/models/job.model';
import { AgendaComponent } from './agenda.component';

const agendaUrl = `${environment.apiUrl}/jobs/agenda`;
const customersUrl = `${environment.apiUrl}/customers`;
const usersUrl = `${environment.apiUrl}/users`;

const ME = 'membership-me';

// «Ahora» en estos tests: miércoles 11 de noviembre de 2026, 10:00 (hora local de la máquina). La semana es la del lunes 9 al domingo 15.
const NOW = new Date(2026, 10, 11, 10, 0);

// Un instante a partir de componentes LOCALES: los tests dan lo mismo en cualquier huso.
const at = (day: number, hour: number, minute = 0, month = 10) => new Date(2026, month, day, hour, minute).toISOString();

const job = (id: string, title: string, scheduledDate: string, overrides: Partial<Job> = {}): Job => ({
    id,
    customerId: 'c1',
    title,
    description: null,
    status: 'Scheduled',
    priority: 'Normal',
    scheduledDate,
    assignedTenantUserId: null,
    estimatedDurationMinutes: null,
    ...overrides
});

describe('AgendaComponent', () => {
    let httpMock: HttpTestingController;
    let harness: RouterTestingHarness;

    // Abre /agenda con el rol y la cuenta indicados y deja pendiente (sin responder) la petición de la agenda.
    async function open(role: TenantRole = 'Manager', account: Partial<CurrentAccount> | null = {}, now: Date = NOW): Promise<HTMLElement> {
        TestBed.configureTestingModule({
            providers: [provideRouter([{ path: 'agenda', component: AgendaComponent }]), provideHttpClient(), provideHttpClientTesting(), { provide: CLOCK, useValue: () => now }]
        });
        httpMock = TestBed.inject(HttpTestingController);

        const session = TestBed.inject(CurrentSessionService);
        session.establish(buildSessionToken());
        if (account) {
            session.setAccount(buildAccount({ role, membershipId: ME, ...account }));
        }

        harness = await RouterTestingHarness.create();
        await harness.navigateByUrl('/agenda', AgendaComponent);
        return harness.routeNativeElement as HTMLElement;
    }

    const agendaRequests = () => httpMock.match((request) => request.url === agendaUrl);
    const lastAgenda = (): TestRequest => {
        const requests = agendaRequests();
        expect(requests.length).withContext('peticiones de la agenda pendientes').toBe(1);
        return requests[0];
    };

    // Responde a la agenda y a los nombres (clientes y equipo) y pinta.
    function answer(host: HTMLElement, jobs: Job[], names = true): void {
        lastAgenda().flush(jobs);
        answerNames(names);
        harness.detectChanges();
    }

    function answerNames(names = true): void {
        httpMock.match(customersUrl).forEach((request) => request.flush(names ? [{ id: 'c1', type: 'Person', name: 'Marta Gil', email: null, phone: null, address: null, notes: null }] : []));
        httpMock.match(usersUrl).forEach((request) => request.flush(names ? [{ id: 'membership-luis', name: 'Luis', email: 'luis@x.com', role: 'Technician', isActive: true }] : []));
    }

    const day = (host: HTMLElement, key: string) => host.querySelector(`[data-day="${key}"]`) as HTMLElement;
    const titlesOf = (host: HTMLElement, key: string) => Array.from(day(host, key).querySelectorAll('[data-job]')).map((card) => card.querySelector('.font-medium')?.textContent?.trim());
    const button = (host: HTMLElement, label: string) => host.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement;
    const buttonByText = (host: HTMLElement, text: string) => Array.from(host.querySelectorAll('p-button button')).find((b) => b.textContent?.trim() === text) as HTMLButtonElement;

    afterEach(() => httpMock.verify());

    describe('the week it asks for', () => {
        it('asks the API for Monday 00:00 to the next Monday 00:00, local time, as UTC instants with the Z', async () => {
            await open();

            const request = lastAgenda();
            expect(request.request.params.get('from')).toBe(new Date(2026, 10, 9).toISOString());
            expect(request.request.params.get('to')).toBe(new Date(2026, 10, 16).toISOString());
            expect(request.request.params.get('from')!.endsWith('Z')).toBeTrue();
            request.flush([]);
            answerNames();
        });

        it('asks again for the next week with "Siguiente" and for the previous one with "Anterior"', async () => {
            const host = await open();
            answer(host, []);

            button(host, 'Semana siguiente').click();
            let request = lastAgenda();
            expect(request.request.params.get('from')).toBe(new Date(2026, 10, 16).toISOString());
            expect(request.request.params.get('to')).toBe(new Date(2026, 10, 23).toISOString());
            request.flush([]);

            button(host, 'Semana anterior').click();
            button(host, 'Semana anterior').click();
            // Dos clics seguidos: la primera petición quedó anulada por la segunda.
            const pending = agendaRequests();
            expect(pending.length).toBe(2);
            pending[1].flush([]);
            expect(pending[1].request.params.get('from')).toBe(new Date(2026, 10, 2).toISOString());
        });

        it('"Hoy" goes back to the week of today', async () => {
            const host = await open();
            answer(host, []);
            button(host, 'Semana siguiente').click();
            lastAgenda().flush([]);
            harness.detectChanges();

            buttonByText(host, 'Hoy').click();

            const request = lastAgenda();
            expect(request.request.params.get('from')).toBe(new Date(2026, 10, 9).toISOString());
            request.flush([]);
        });

        it('shows the range of the week in the header', async () => {
            const host = await open();
            answer(host, []);

            const label = host.querySelector('[data-testid="week-label"]')?.textContent ?? '';
            expect(label).toContain('9');
            expect(label).toContain('15');
            expect(label).toContain('2026');
        });

        it('the week that crosses a year shows the year of its last day', async () => {
            const host = await open('Manager', {}, new Date(2026, 11, 30, 10, 0)); // miércoles 30 de diciembre: semana del 28 al 3 de enero
            answer(host, []);

            expect(host.querySelector('[data-testid="week-label"]')?.textContent).toContain('2027');
        });

        it('only the answer to the LAST request counts if the person changes week quickly', async () => {
            const host = await open();
            answer(host, []);

            button(host, 'Semana siguiente').click();
            const first = lastAgenda();
            button(host, 'Semana siguiente').click();
            const second = lastAgenda();
            // La segunda (semana del 23) llega antes; la primera (semana del 16) llega tarde con otros trabajos.
            second.flush([job('late', 'Del 23', at(24, 9))]);
            first.flush([job('stale', 'Del 16', at(17, 9))]);
            harness.detectChanges();

            const titles = Array.from(host.querySelectorAll('[data-job]')).map((card) => card.querySelector('.font-medium')?.textContent?.trim());
            expect(titles).toEqual(['Del 23']);
        });
    });

    describe('what it shows', () => {
        it('puts each job on its LOCAL day, in order, with its time, customer, assignee and status', async () => {
            const host = await open();
            answer(host, [
                job('j2', 'Lunes tarde', at(9, 15, 30), { estimatedDurationMinutes: 45 }),
                job('j1', 'Lunes mañana', at(9, 9), { assignedTenantUserId: 'membership-luis' }),
                job('j3', 'Jueves', at(12, 10), { assignedTenantUserId: ME, status: 'InProgress' })
            ]);

            // La API ya los entrega por fecha; aquí se comprueba el reparto por día.
            expect(titlesOf(host, '2026-11-09')).toEqual(['Lunes tarde', 'Lunes mañana']);
            expect(titlesOf(host, '2026-11-12')).toEqual(['Jueves']);

            const card = day(host, '2026-11-09').querySelector('[data-job="j2"]') as HTMLElement;
            expect(card.textContent).toContain('15:30');
            expect(card.textContent).toContain('45 min');
            expect(card.textContent).toContain('Marta Gil');
            expect(card.textContent).toContain('Sin asignar');
            expect(card.textContent).toContain('Programado');

            expect((day(host, '2026-11-09').querySelector('[data-job="j1"]') as HTMLElement).textContent).toContain('Luis');
            const thursday = day(host, '2026-11-12').querySelector('[data-job="j3"]') as HTMLElement;
            expect(thursday.textContent).toContain('Tú');
            expect(thursday.textContent).toContain('En curso');
        });

        it('a job at 23:30 local stays on its own day, not the next one', async () => {
            const host = await open();
            answer(host, [job('late', 'Casi medianoche', at(10, 23, 30))]);

            expect(titlesOf(host, '2026-11-10')).toEqual(['Casi medianoche']);
            expect(titlesOf(host, '2026-11-11')).toEqual([]);
        });

        it('a job at 00:30 local stays on its own day, not the previous one (UTC may still say yesterday)', async () => {
            const host = await open();
            answer(host, [job('early', 'Recién pasada la medianoche', at(10, 0, 30))]);

            expect(titlesOf(host, '2026-11-10')).toEqual(['Recién pasada la medianoche']);
            expect(titlesOf(host, '2026-11-09')).toEqual([]);
        });

        it('seven days, Monday to Sunday', async () => {
            const host = await open();
            answer(host, []);

            const keys = Array.from(host.querySelectorAll('[data-day]')).map((section) => section.getAttribute('data-day'));
            expect(keys).toEqual(['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15']);
        });

        it('marks only today', async () => {
            const host = await open();
            answer(host, []);

            const current = Array.from(host.querySelectorAll('[aria-current="date"]')).map((section) => section.getAttribute('data-day'));
            expect(current).toEqual(['2026-11-11']);
        });

        it('shows "Sin trabajos" for an empty day and a message when the whole week is empty', async () => {
            const host = await open();
            answer(host, []);

            expect(day(host, '2026-11-10').textContent).toContain('Sin trabajos');
            expect(host.querySelector('[data-testid="empty-week"]')?.textContent).toContain('No hay trabajos programados esta semana');
        });

        it('does not show the empty-week message when there are jobs', async () => {
            const host = await open();
            answer(host, [job('j1', 'Uno', at(10, 9))]);

            expect(host.querySelector('[data-testid="empty-week"]')).toBeNull();
        });

        it('marks as "Vencido" a scheduled job whose time has passed, and not an in-progress, completed or future one', async () => {
            const host = await open(); // ahora: miércoles 11 a las 10:00
            answer(host, [
                job('late', 'Vencido', at(10, 9)),
                job('future', 'Futuro', at(12, 9)),
                job('doing', 'En curso pasado', at(10, 10), { status: 'InProgress' }),
                job('done', 'Hecho pasado', at(10, 11), { status: 'Completed' })
            ]);

            const overdueIds = Array.from(host.querySelectorAll('[data-job]'))
                .filter((card) => Array.from(card.querySelectorAll('p-tag')).some((tag) => tag.textContent?.trim() === 'Vencido'))
                .map((card) => card.getAttribute('data-job'));
            expect(overdueIds).toEqual(['late']);
        });

        it('shows "—" for a customer it could not resolve and "Asignado" for an unknown teammate', async () => {
            const host = await open();
            answer(host, [job('j1', 'Sin datos', at(10, 9), { customerId: 'ghost', assignedTenantUserId: 'membership-ghost' })], false);

            const card = day(host, '2026-11-10').querySelector('[data-job="j1"]') as HTMLElement;
            expect(card.textContent).toContain('—');
            expect(card.textContent).toContain('Asignado');
        });
    });

    describe('roles', () => {
        it('a role that can edit jobs gets the title as a link to the job form', async () => {
            const host = await open('Manager');
            answer(host, [job('j1', 'Reparar', at(10, 9))]);

            const link = day(host, '2026-11-10').querySelector('[data-job="j1"] a') as HTMLAnchorElement;
            expect(link?.getAttribute('href')).toBe('/jobs/j1');
        });

        it('a Technician (cannot edit jobs) sees plain text, no link, and still sees the whole agenda', async () => {
            const host = await open('Technician');
            answer(host, [job('j1', 'Reparar', at(10, 9))]);

            expect(day(host, '2026-11-10').querySelector('[data-job="j1"] a')).toBeNull();
            expect(titlesOf(host, '2026-11-10')).toEqual(['Reparar']);
        });

        it('the link follows a role change WITHOUT navigating', async () => {
            const host = await open('Technician');
            answer(host, [job('j1', 'Reparar', at(10, 9))]);
            expect(day(host, '2026-11-10').querySelector('[data-job="j1"] a')).toBeNull();

            TestBed.inject(CurrentSessionService).setAccount(buildAccount({ role: 'Manager', membershipId: ME }));
            harness.detectChanges();

            expect(day(host, '2026-11-10').querySelector('[data-job="j1"] a')).not.toBeNull();
        });

        it('without Users.Read it does not even ask for the team', async () => {
            await open('Technician');

            lastAgenda().flush([]);
            httpMock.match(customersUrl).forEach((request) => request.flush([]));
            expect(httpMock.match(usersUrl).length).toBe(0);
        });

        it('with Users.Read it asks for the team to show names', async () => {
            await open('Manager');

            lastAgenda().flush([]);
            httpMock.match(customersUrl).forEach((request) => request.flush([]));
            const users = httpMock.match(usersUrl);
            expect(users.length).toBe(1);
            users[0].flush([]);
        });
    });

    describe('"Solo mis trabajos"', () => {
        const jobs = () => [job('mine', 'Mío', at(10, 9), { assignedTenantUserId: ME }), job('theirs', 'De Luis', at(10, 10), { assignedTenantUserId: 'membership-luis' }), job('free', 'Sin dueño', at(10, 11))];
        const mineHost = (host: HTMLElement) => Array.from(host.querySelectorAll('p-button')).find((b) => b.textContent?.includes('Solo mis trabajos'));

        it('shows everything by default and toggles to only mine', async () => {
            const host = await open('Technician');
            answer(host, jobs());
            expect(titlesOf(host, '2026-11-10')).toEqual(['Mío', 'De Luis', 'Sin dueño']);
            expect(mineHost(host)?.getAttribute('aria-pressed')).toBe('false');

            mineHost(host)?.querySelector('button')?.click();
            harness.detectChanges();
            expect(titlesOf(host, '2026-11-10')).toEqual(['Mío']);
            expect(mineHost(host)?.getAttribute('aria-pressed')).toBe('true');

            mineHost(host)?.querySelector('button')?.click();
            harness.detectChanges();
            expect(titlesOf(host, '2026-11-10')).toEqual(['Mío', 'De Luis', 'Sin dueño']);
        });

        it('keeps the filter when the week changes', async () => {
            const host = await open('Technician');
            answer(host, jobs());
            mineHost(host)?.querySelector('button')?.click();

            button(host, 'Semana siguiente').click();
            lastAgenda().flush([job('m2', 'Mío próxima', at(17, 9), { assignedTenantUserId: ME }), job('t2', 'Ajeno próxima', at(17, 10), { assignedTenantUserId: 'membership-luis' })]);
            harness.detectChanges();

            expect(titlesOf(host, '2026-11-17')).toEqual(['Mío próxima']);
        });

        it('if the membership id disappears while the filter is on, it shows nothing instead of everything', async () => {
            const host = await open('Technician');
            answer(host, jobs());
            mineHost(host)?.querySelector('button')?.click();
            harness.detectChanges();
            expect(titlesOf(host, '2026-11-10')).toEqual(['Mío']);

            // La cuenta se vuelve a cargar sin pertenencia (p. ej. tras un error): «mío» ya no se puede saber.
            TestBed.inject(CurrentSessionService).setAccount(buildAccount({ role: 'Technician', membershipId: '' }));
            harness.detectChanges();

            expect(titlesOf(host, '2026-11-10')).toEqual([]);
        });

        it('without a membership id there is no button (and nothing is guessed as "mine")', async () => {
            const host = await open('Technician', { membershipId: '' });
            answer(host, jobs());

            expect(mineHost(host)).toBeUndefined();
        });
    });

    describe('failures', () => {
        it('shows the API message and a retry that asks again', async () => {
            const host = await open();
            lastAgenda().flush({ status: 400, code: 'validation.failed', detail: 'El rango no es válido.' }, { status: 400, statusText: 'Bad Request' });
            answerNames();
            harness.detectChanges();

            expect(host.textContent).toContain('El rango no es válido.');
            expect(host.querySelector('[data-testid="empty-week"]')).toBeNull(); // un error no es «no hay trabajos»

            buttonByText(host, 'Reintentar').click();
            lastAgenda().flush([job('j1', 'Por fin', at(10, 9))]);
            harness.detectChanges();

            expect(host.textContent).not.toContain('El rango no es válido.');
            expect(titlesOf(host, '2026-11-10')).toEqual(['Por fin']);
        });

        it('a failure while loading names does not stop the agenda from showing', async () => {
            const host = await open();
            lastAgenda().flush([job('j1', 'Sigue', at(10, 9))]);
            httpMock.match(customersUrl).forEach((request) => request.flush({ status: 500 }, { status: 500, statusText: 'Server Error' }));
            httpMock.match(usersUrl).forEach((request) => request.flush({ status: 500 }, { status: 500, statusText: 'Server Error' }));
            harness.detectChanges();

            expect(titlesOf(host, '2026-11-10')).toEqual(['Sigue']);
            expect((day(host, '2026-11-10').querySelector('[data-job="j1"]') as HTMLElement).textContent).toContain('—');
        });

        it('shows a loading state while the answer is pending', async () => {
            const host = await open();
            harness.detectChanges();

            expect(host.querySelector('[role="status"]')?.textContent).toContain('Cargando');
            lastAgenda().flush([]);
            answerNames();
            harness.detectChanges();
            expect(host.querySelector('[role="status"]')).toBeNull();
        });
    });
});
