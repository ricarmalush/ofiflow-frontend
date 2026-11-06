import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { MessageService } from 'primeng/api';
import { environment } from '../../../../../environments/environment';
import { CurrentSessionService } from '../../../../core/services/current-session';
import { buildAccount } from '../../../../core/testing/fake-account';
import { buildSessionToken } from '../../../../core/testing/fake-jwt';
import { TenantRole } from '../../../../shared/models/auth.model';
import { Job, JobStatus } from '../../../../shared/models/job.model';
import { JobFormComponent } from './job-form.component';

const jobsUrl = `${environment.apiUrl}/jobs`;
const customersUrl = `${environment.apiUrl}/customers`;
const usersUrl = `${environment.apiUrl}/users`;

const local = (day: number, hour: number, minute = 0) => new Date(2026, 10, day, hour, minute);

const job = (status: JobStatus, scheduledDate: string | null = null, estimatedDurationMinutes: number | null = null): Job => ({
    id: 'job-1',
    customerId: 'c1',
    title: 'Revisar caldera',
    description: null,
    status,
    priority: 'Normal',
    scheduledDate,
    assignedTenantUserId: null,
    estimatedDurationMinutes
});

// La sección «Programación» del formulario del trabajo (spec 020 F5). El resto del formulario (alta, edición, asignación) ya funcionaba y
// no se repite aquí.
describe('JobFormComponent · programming section', () => {
    let httpMock: HttpTestingController;
    let harness: RouterTestingHarness;
    let messages: jasmine.Spy;

    // Abre /jobs/job-1 (o /jobs/new) con el rol indicado y responde a las tres peticiones de la carga.
    async function open(role: TenantRole, loaded: Job | null = job('New'), url = '/jobs/job-1'): Promise<HTMLElement> {
        const session = TestBed.inject(CurrentSessionService);
        session.establish(buildSessionToken());
        session.setAccount(buildAccount({ role }));

        harness = await RouterTestingHarness.create();
        await harness.navigateByUrl(url, JobFormComponent);
        httpMock.expectOne(customersUrl).flush([{ id: 'c1', type: 'Person', name: 'Marta Gil', email: null, phone: null, address: null, notes: null }]);
        httpMock.match(usersUrl).forEach((request) => request.flush([]));
        if (loaded) {
            httpMock.expectOne(`${jobsUrl}/job-1`).flush(loaded);
        }
        await settle();
        return harness.routeNativeElement as HTMLElement;
    }

    // ngModel escribe los valores de forma asíncrona: hay que esperar antes de leer o de dar por escrito un campo.
    async function settle(): Promise<void> {
        harness.detectChanges();
        await harness.fixture.whenStable();
        harness.detectChanges();
    }

    const section = (host: HTMLElement) => host.querySelector('[data-testid="schedule-section"]') as HTMLElement | null;
    const dateInput = (host: HTMLElement) => host.querySelector('#scheduledAt') as HTMLInputElement;
    const minutesInput = (host: HTMLElement) => host.querySelector('#duration') as HTMLInputElement;
    const scheduleButton = (host: HTMLElement) => host.querySelector('[data-testid="schedule-button"] button') as HTMLButtonElement;
    const unscheduleButton = (host: HTMLElement) => host.querySelector('[data-testid="unschedule-button"] button') as HTMLButtonElement | null;

    async function type(input: HTMLInputElement, value: string): Promise<void> {
        input.value = value;
        input.dispatchEvent(new Event('input'));
        await settle();
    }

    beforeEach(() => {
        messages = jasmine.createSpy('add');
        TestBed.configureTestingModule({
            providers: [
                provideRouter([
                    { path: 'jobs/new', component: JobFormComponent },
                    { path: 'jobs/:id', component: JobFormComponent },
                    { path: 'jobs', component: JobFormComponent }
                ]),
                provideHttpClient(),
                provideHttpClientTesting(),
                { provide: MessageService, useValue: { add: messages } }
            ]
        });
        httpMock = TestBed.inject(HttpTestingController);
    });

    afterEach(() => httpMock.verify());

    describe('who sees it', () => {
        it('a role with Jobs.Schedule sees it when editing a job', async () => {
            expect(section(await open('Manager'))).not.toBeNull();
        });

        it('a role without Jobs.Schedule (Employee) does not, even though it can edit the job', async () => {
            const host = await open('Employee');

            expect(host.querySelector('#title')).not.toBeNull(); // sí edita el trabajo
            expect(section(host)).toBeNull();
        });

        it('nobody sees it when creating a job: there is nothing to schedule yet', async () => {
            expect(section(await open('Manager', null, '/jobs/new'))).toBeNull();
        });

        it('it follows a role change WITHOUT navigating', async () => {
            const host = await open('Manager');
            expect(section(host)).not.toBeNull();

            TestBed.inject(CurrentSessionService).setAccount(buildAccount({ role: 'Employee' }));
            await settle();

            expect(section(host)).toBeNull();
        });
    });

    describe('what it shows', () => {
        it('a new job: "Programar", empty fields and no "Quitar de la agenda"', async () => {
            const host = await open('Manager', job('New'));

            expect(scheduleButton(host).textContent?.trim()).toBe('Programar');
            expect(dateInput(host).value).toBe('');
            expect(minutesInput(host).value).toBe('');
            expect(unscheduleButton(host)).toBeNull();
            expect(dateInput(host).disabled).toBeFalse();
        });

        it('a scheduled job: its date in the browser time, its duration, "Reprogramar" and "Quitar de la agenda"', async () => {
            const host = await open('Manager', job('Scheduled', local(10, 9, 30).toISOString(), 90));

            expect(dateInput(host).value).toBe('2026-11-10T09:30');
            expect(minutesInput(host).value).toBe('90');
            expect(scheduleButton(host).textContent?.trim()).toBe('Reprogramar');
            expect(unscheduleButton(host)?.textContent?.trim()).toBe('Quitar de la agenda');
        });

        for (const [status, text] of [
            ['InProgress', 'en curso'],
            ['Completed', 'completado'],
            ['Cancelled', 'cancelado']
        ] as const) {
            it(`a ${status} job: the section is disabled and says why`, async () => {
                const host = await open('Manager', job(status, local(10, 9).toISOString(), 60));

                expect(dateInput(host).disabled).toBeTrue();
                expect(minutesInput(host).disabled).toBeTrue();
                expect(scheduleButton(host).disabled).toBeTrue();
                expect(host.querySelector('[data-testid="schedule-locked"]')?.textContent).toContain(`No se puede programar un trabajo ${text}.`);
                expect(unscheduleButton(host)).toBeNull();
            });
        }

        it('even if the method is called directly, a locked job is not scheduled and a not-scheduled job is not unscheduled', async () => {
            // El botón desactivado ya lo impide en la pantalla; esto prueba que el propio método también se niega (defensa en profundidad).
            const host = await open('Manager', job('InProgress', local(10, 9).toISOString(), 60));
            const component = harness.routeDebugElement!.componentInstance as JobFormComponent;
            expect(host).toBeTruthy();

            component.scheduleAt = '2026-11-12T09:00';
            component.schedule();
            component.unschedule();

            httpMock.expectNone(`${jobsUrl}/job-1/schedule`);
        });

        it('a job that could not be loaded leaves the section disabled', async () => {
            const session = TestBed.inject(CurrentSessionService);
            session.establish(buildSessionToken());
            session.setAccount(buildAccount({ role: 'Manager' }));
            harness = await RouterTestingHarness.create();
            await harness.navigateByUrl('/jobs/job-1', JobFormComponent);
            httpMock.expectOne(customersUrl).flush([]);
            httpMock.match(usersUrl).forEach((request) => request.flush([]));
            httpMock.expectOne(`${jobsUrl}/job-1`).flush({ status: 404, detail: 'No se ha encontrado el trabajo.' }, { status: 404, statusText: 'Not Found' });
            await settle();
            const host = harness.routeNativeElement as HTMLElement;

            expect(scheduleButton(host).disabled).toBeTrue();
        });
    });

    describe('scheduling', () => {
        it('sends the typed wall-clock time as a UTC instant with the Z, and the duration', async () => {
            const host = await open('Manager', job('New'));
            await type(dateInput(host), '2026-11-10T09:00');
            await type(minutesInput(host), '90');

            scheduleButton(host).click();

            const request = httpMock.expectOne(`${jobsUrl}/job-1/schedule`);
            expect(request.request.method).toBe('PUT');
            expect(request.request.body).toEqual({ scheduledDate: local(10, 9).toISOString(), estimatedDurationMinutes: 90 });
            expect((request.request.body as { scheduledDate: string }).scheduledDate.endsWith('Z')).toBeTrue();
            request.flush(null, { status: 204, statusText: 'No Content' });
            httpMock.expectOne(`${jobsUrl}/job-1`).flush(job('Scheduled', local(10, 9).toISOString(), 90));
            await settle();
        });

        it('without a duration it sends null, so the API erases any old one', async () => {
            const host = await open('Manager', job('New'));
            await type(dateInput(host), '2026-11-10T09:00');

            scheduleButton(host).click();

            const request = httpMock.expectOne(`${jobsUrl}/job-1/schedule`);
            expect((request.request.body as { estimatedDurationMinutes: number | null }).estimatedDurationMinutes).toBeNull();
            request.flush(null, { status: 204, statusText: 'No Content' });
            httpMock.expectOne(`${jobsUrl}/job-1`).flush(job('Scheduled', local(10, 9).toISOString()));
            await settle();
        });

        it('after a success it reloads the job: the section now reads "Reprogramar", the header tag changes and a message appears', async () => {
            const host = await open('Manager', job('New'));
            await type(dateInput(host), '2026-11-10T09:00');
            await type(minutesInput(host), '45');

            scheduleButton(host).click();
            httpMock.expectOne(`${jobsUrl}/job-1/schedule`).flush(null, { status: 204, statusText: 'No Content' });
            httpMock.expectOne(`${jobsUrl}/job-1`).flush(job('Scheduled', local(10, 9).toISOString(), 45));
            await settle();

            expect(scheduleButton(host).textContent?.trim()).toBe('Reprogramar');
            expect(unscheduleButton(host)).not.toBeNull();
            expect(host.textContent).toContain('Programado');
            expect(messages).toHaveBeenCalledWith(jasmine.objectContaining({ severity: 'success', summary: 'Trabajo programado' }));
        });

        it('rescheduling says "reprogramado"', async () => {
            const host = await open('Manager', job('Scheduled', local(10, 9).toISOString(), 60));
            await type(dateInput(host), '2026-11-12T16:00');

            scheduleButton(host).click();
            httpMock.expectOne(`${jobsUrl}/job-1/schedule`).flush(null, { status: 204, statusText: 'No Content' });
            httpMock.expectOne(`${jobsUrl}/job-1`).flush(job('Scheduled', local(12, 16).toISOString()));
            await settle();

            expect(messages).toHaveBeenCalledWith(jasmine.objectContaining({ summary: 'Trabajo reprogramado' }));
            expect(dateInput(host).value).toBe('2026-11-12T16:00');
        });

        it('an empty date is refused before sending anything', async () => {
            const host = await open('Manager', job('New'));

            scheduleButton(host).click();
            await settle();

            httpMock.expectNone(`${jobsUrl}/job-1/schedule`);
            expect(host.textContent).toContain('Indica la fecha y la hora.');
        });

        for (const minutes of ['0', '1441', '-5', '1.5']) {
            it(`a duration of ${minutes} is refused before sending anything`, async () => {
                const host = await open('Manager', job('New'));
                await type(dateInput(host), '2026-11-10T09:00');
                await type(minutesInput(host), minutes);

                scheduleButton(host).click();
                await settle();

                httpMock.expectNone(`${jobsUrl}/job-1/schedule`);
                expect(host.textContent).toContain('La duración son minutos enteros, de 1 a 1440.');
            });
        }

        for (const minutes of ['1', '1440']) {
            it(`a duration of ${minutes} (the limit itself) is sent`, async () => {
                const host = await open('Manager', job('New'));
                await type(dateInput(host), '2026-11-10T09:00');
                await type(minutesInput(host), minutes);

                scheduleButton(host).click();

                const request = httpMock.expectOne(`${jobsUrl}/job-1/schedule`);
                expect((request.request.body as { estimatedDurationMinutes: number }).estimatedDurationMinutes).toBe(Number(minutes));
                request.flush(null, { status: 204, statusText: 'No Content' });
                httpMock.expectOne(`${jobsUrl}/job-1`).flush(job('Scheduled', local(10, 9).toISOString(), Number(minutes)));
                await settle();
            });
        }

        it('when the API refuses, it shows the message and KEEPS what the person typed', async () => {
            const host = await open('Manager', job('New'));
            await type(dateInput(host), '2026-11-10T09:00');
            await type(minutesInput(host), '90');

            scheduleButton(host).click();
            httpMock
                .expectOne(`${jobsUrl}/job-1/schedule`)
                .flush({ status: 400, code: 'job.cannot_schedule', detail: 'Solo se puede programar un trabajo nuevo o ya programado.' }, { status: 400, statusText: 'Bad Request' });
            await settle();

            expect(host.textContent).toContain('Solo se puede programar un trabajo nuevo o ya programado.');
            expect(dateInput(host).value).toBe('2026-11-10T09:00');
            expect(minutesInput(host).value).toBe('90');
            httpMock.expectNone(`${jobsUrl}/job-1`); // no recarga nada si falló
            expect(messages).not.toHaveBeenCalled();
        });

        it('a field error from the API is shown under its field', async () => {
            const host = await open('Manager', job('New'));
            await type(dateInput(host), '2026-11-10T09:00');
            await type(minutesInput(host), '90');

            scheduleButton(host).click();
            httpMock.expectOne(`${jobsUrl}/job-1/schedule`).flush(
                {
                    status: 400,
                    code: 'validation.failed',
                    detail: 'Uno o más campos no son válidos.',
                    errors: [
                        { field: 'ScheduledDate', code: 'job.schedule_date_invalid', message: 'La fecha no es válida.' },
                        { field: 'EstimatedDurationMinutes', code: 'job.estimated_duration_invalid', message: 'La duración no es válida.' }
                    ]
                },
                { status: 400, statusText: 'Bad Request' }
            );
            await settle();

            expect(host.textContent).toContain('La fecha no es válida.');
            expect(host.textContent).toContain('La duración no es válida.');
        });

        it('a second click while the first is in flight sends nothing more', async () => {
            const host = await open('Manager', job('New'));
            await type(dateInput(host), '2026-11-10T09:00');

            scheduleButton(host).click();
            scheduleButton(host).click();

            const pending = httpMock.match(`${jobsUrl}/job-1/schedule`);
            expect(pending.length).toBe(1);
            pending[0].flush(null, { status: 204, statusText: 'No Content' });
            httpMock.expectOne(`${jobsUrl}/job-1`).flush(job('Scheduled', local(10, 9).toISOString()));
            await settle();
        });
    });

    describe('taking it off the agenda', () => {
        it('sends a DELETE, reloads the job and leaves the fields empty', async () => {
            const host = await open('Manager', job('Scheduled', local(10, 9).toISOString(), 60));

            unscheduleButton(host)?.click();

            const request = httpMock.expectOne(`${jobsUrl}/job-1/schedule`);
            expect(request.request.method).toBe('DELETE');
            request.flush(null, { status: 204, statusText: 'No Content' });
            httpMock.expectOne(`${jobsUrl}/job-1`).flush(job('New'));
            await settle();

            expect(dateInput(host).value).toBe('');
            expect(minutesInput(host).value).toBe('');
            expect(scheduleButton(host).textContent?.trim()).toBe('Programar');
            expect(unscheduleButton(host)).toBeNull();
            expect(messages).toHaveBeenCalledWith(jasmine.objectContaining({ summary: 'Trabajo quitado de la agenda' }));
        });

        it('if the API refuses it shows the message and keeps the programming', async () => {
            const host = await open('Manager', job('Scheduled', local(10, 9).toISOString(), 60));

            unscheduleButton(host)?.click();
            httpMock
                .expectOne(`${jobsUrl}/job-1/schedule`)
                .flush({ status: 400, code: 'job.cannot_unschedule', detail: 'Solo se puede quitar de la agenda un trabajo programado.' }, { status: 400, statusText: 'Bad Request' });
            await settle();

            expect(host.textContent).toContain('Solo se puede quitar de la agenda un trabajo programado.');
            expect(dateInput(host).value).toBe('2026-11-10T09:00');
            expect(unscheduleButton(host)).not.toBeNull();
        });
    });
});
