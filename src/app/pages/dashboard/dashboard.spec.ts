import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../../../environments/environment';
import { CurrentSessionService } from '../../core/services/current-session';
import { buildSessionToken } from '../../core/testing/fake-jwt';
import { Customer } from '../../shared/models/customer.model';
import { Job, JobPriority, JobStatus } from '../../shared/models/job.model';
import { Dashboard } from './dashboard';

const customersUrl = `${environment.apiUrl}/customers`;
const jobsUrl = `${environment.apiUrl}/jobs`;

const customer = (id: string, name: string): Customer => ({ id, type: 'Person', name, email: null, phone: null, address: null, notes: null });
const job = (id: string, title: string, status: JobStatus, priority: JobPriority, overrides: Partial<Job> = {}): Job => ({
    id,
    customerId: 'c1',
    title,
    description: null,
    status,
    priority,
    scheduledDate: null,
    assignedTenantUserId: null,
    estimatedDurationMinutes: null,
    ...overrides
});

describe('Dashboard', () => {
    let fixture: ComponentFixture<Dashboard>;
    let httpMock: HttpTestingController;

    function start(role: string): void {
        TestBed.inject(CurrentSessionService).establish(buildSessionToken({ role }));
        fixture = TestBed.createComponent(Dashboard);
        fixture.detectChanges(); // ngOnInit: lanza las peticiones
    }

    const text = () => (fixture.nativeElement as HTMLElement).textContent?.replace(/\s+/g, ' ') ?? '';
    const tileLabels = () => Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('a.card')).map((tile) => tile.getAttribute('aria-label'));

    beforeEach(() => {
        TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
        httpMock = TestBed.inject(HttpTestingController);
    });

    afterEach(() => httpMock.verify());

    it('shows the counters, the jobs that need attention (with their customer name) and the breakdown by status', () => {
        start('Owner');
        httpMock.expectOne(customersUrl).flush([customer('c1', 'Marta Gómez'), customer('c2', 'Bar Pepe')]);
        httpMock.expectOne(jobsUrl).flush([
            job('j1', 'Avería en cocina', 'InProgress', 'Urgent'),
            job('j2', 'Revisión anual', 'New', 'Normal', { assignedTenantUserId: 'm1' }),
            job('j3', 'Cambiar grifo', 'New', 'High'),
            job('j4', 'Trabajo antiguo', 'Completed', 'Urgent')
        ]);
        fixture.detectChanges();

        expect(tileLabels()).toEqual(['Clientes: 2', 'Trabajos abiertos: 3', 'En curso: 1', 'Urgentes y altas: 2', 'Sin asignar: 2']);

        // Requieren atención: los abiertos Urgentes o Altos (el completado no), con el nombre del cliente.
        expect(text()).toContain('Avería en cocina');
        expect(text()).toContain('Cambiar grifo');
        expect(text()).not.toContain('Trabajo antiguo');
        expect(text()).toContain('Marta Gómez');

        // Reparto por estado: aparecen los seis.
        for (const label of ['Nuevo', 'Pendiente', 'Programado', 'En curso', 'Completado', 'Cancelado']) {
            expect(text()).toContain(label);
        }
    });

    it('offers a link to edit the job only to roles that can write jobs', () => {
        start('Owner');
        httpMock.expectOne(customersUrl).flush([customer('c1', 'Marta')]);
        httpMock.expectOne(jobsUrl).flush([job('j1', 'Avería', 'New', 'Urgent')]);
        fixture.detectChanges();

        const link = (fixture.nativeElement as HTMLElement).querySelector('li a');
        expect(link?.getAttribute('href')).toBe('/jobs/j1');
    });

    it('for a Technician: no "unassigned" tile (it is not their action) and the jobs are not links (they cannot edit them)', () => {
        start('Technician');
        httpMock.expectOne(customersUrl).flush([customer('c1', 'Marta')]);
        httpMock.expectOne(jobsUrl).flush([job('j1', 'Avería', 'New', 'Urgent')]);
        fixture.detectChanges();

        expect(tileLabels()).not.toContain('Sin asignar: 1');
        expect(tileLabels().some((label) => label?.startsWith('Sin asignar'))).toBeFalse();
        expect((fixture.nativeElement as HTMLElement).querySelector('li a')).toBeNull();
        expect(text()).toContain('Avería');
    });

    it('asks only for what the role can read: a role without permissions makes no request at all', () => {
        start('Guest'); // un rol desconocido no tiene ningún permiso

        httpMock.expectNone(customersUrl);
        httpMock.expectNone(jobsUrl);
        fixture.detectChanges();

        expect(tileLabels()).toEqual([]);
    });

    it('tells a brand new company where to start, instead of showing zeros', () => {
        start('Owner');
        httpMock.expectOne(customersUrl).flush([]);
        httpMock.expectOne(jobsUrl).flush([]);
        fixture.detectChanges();

        expect(text()).toContain('Aún no hay nada que mostrar');
        expect(text()).toContain('Crear cliente');
        expect(tileLabels()).toEqual([]);
    });

    it('does not offer to create customers to a role that cannot', () => {
        start('Technician');
        httpMock.expectOne(customersUrl).flush([]);
        httpMock.expectOne(jobsUrl).flush([]);
        fixture.detectChanges();

        expect(text()).toContain('Aún no hay nada que mostrar');
        expect(text()).not.toContain('Crear cliente');
    });

    it('if the jobs fail it says so and keeps the customers tile; "retry" asks again', () => {
        start('Owner');
        httpMock.expectOne(customersUrl).flush([customer('c1', 'Marta')]);
        httpMock.expectOne(jobsUrl).flush({ code: 'server.unexpected', detail: 'Error del servidor.' }, { status: 500, statusText: 'Server Error' });
        fixture.detectChanges();

        expect(text()).toContain('No se pudieron cargar los trabajos: Error del servidor.');
        expect(tileLabels()).toEqual(['Clientes: 1']);
        expect(text()).not.toContain('Requieren atención');

        fixture.componentInstance.load();
        httpMock.expectOne(customersUrl).flush([customer('c1', 'Marta')]);
        httpMock.expectOne(jobsUrl).flush([job('j1', 'Avería', 'New', 'Urgent')]);
        fixture.detectChanges();

        expect(text()).not.toContain('No se pudieron cargar los trabajos');
        expect(tileLabels()).toContain('Trabajos abiertos: 1');
    });

    it('shows the customer error without hiding the jobs', () => {
        start('Owner');
        httpMock.expectOne(customersUrl).flush({ detail: 'Sin permiso.' }, { status: 403, statusText: 'Forbidden' });
        httpMock.expectOne(jobsUrl).flush([job('j1', 'Avería', 'New', 'Urgent')]);
        fixture.detectChanges();

        expect(text()).toContain('No se pudieron cargar los clientes');
        expect(tileLabels()).toContain('Trabajos abiertos: 1');
        expect(text()).toContain('Avería');
    });

    it('shows "—" for the customer of a job when the customer is not in the list', () => {
        start('Owner');
        httpMock.expectOne(customersUrl).flush([customer('c2', 'Otro')]);
        httpMock.expectOne(jobsUrl).flush([job('j1', 'Avería', 'New', 'Urgent', { customerId: 'desconocido' })]);
        fixture.detectChanges();

        expect(text()).toContain('—');
    });

    it('never builds HTML from API data: a title with markup is shown as text', () => {
        start('Owner');
        httpMock.expectOne(customersUrl).flush([customer('c1', '<img src=x onerror=alert(1)>')]);
        httpMock.expectOne(jobsUrl).flush([job('j1', '<b>negrita</b>', 'New', 'Urgent')]);
        fixture.detectChanges();

        const root = fixture.nativeElement as HTMLElement;
        expect(root.querySelector('li img')).toBeNull();
        expect(root.querySelector('li b')).toBeNull();
        expect(text()).toContain('<b>negrita</b>');
    });
});
