import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterModule } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { TagModule } from 'primeng/tag';
import { forkJoin, of } from 'rxjs';
import { CurrentSessionService } from '../../core/services/current-session';
import { CustomerService } from '../../features/customers/services/customer.service';
import { JobService } from '../../features/jobs/services/job.service';
import { Customer } from '../../shared/models/customer.model';
import { JOB_PRIORITY_LABELS, JOB_STATUS_LABELS, Job, JobStatus, jobPrioritySeverity, jobStatusSeverity } from '../../shared/models/job.model';
import { percentOf, summarizeJobs } from './job-summary';

interface Tile {
    label: string;
    value: number;
    icon: string;
    // Colores de Tailwind por nombre completo (no se construyen con plantillas: Tailwind solo ve las clases escritas enteras).
    iconBox: string;
    iconColor: string;
    link: string;
    queryParams?: Record<string, string>;
}

// Un vistazo a la empresa con lo que ya devuelven los listados: la API no tiene un endpoint de
// resumen, así que los números se calculan aquí con GET /customers y GET /jobs. Solo se piden los
// datos que el rol puede leer (los permisos son un espejo para pintar; la API decide), de modo que
// un rol sin permiso no provoca 403 innecesarios.
@Component({
    selector: 'app-dashboard',
    standalone: true,
    imports: [RouterModule, ButtonModule, MessageModule, TagModule],
    templateUrl: './dashboard.html'
})
export class Dashboard implements OnInit {
    private customerService = inject(CustomerService);
    private jobService = inject(JobService);
    private session = inject(CurrentSessionService);

    readonly canSeeCustomers = this.session.can('Customers.Read');
    readonly canSeeJobs = this.session.can('Jobs.Read');
    private readonly canAssign = this.session.can('Jobs.Assign');
    private readonly canExecute = this.session.can('Jobs.Execute');
    readonly canEditJobs = this.session.can('Jobs.Write');
    readonly canCreateCustomers = this.session.can('Customers.Write');

    readonly loading = signal(true);
    private readonly customers = signal<Customer[]>([]);
    private readonly jobs = signal<Job[]>([]);
    readonly customersError = signal<string | null>(null);
    readonly jobsError = signal<string | null>(null);

    // El Id de MI pertenencia (GET /account/me): con él se cuentan los trabajos asignados a mí.
    readonly summary = computed(() => summarizeJobs(this.jobs(), this.session.membershipId()));
    private readonly customerNames = computed(() => new Map(this.customers().map((customer) => [customer.id, customer.name])));

    readonly tiles = computed<Tile[]>(() => {
        const tiles: Tile[] = [];
        const summary = this.summary();

        if (this.canSeeCustomers && !this.customersError()) {
            tiles.push({ label: 'Clientes', value: this.customers().length, icon: 'pi-users', iconBox: 'bg-blue-100 dark:bg-blue-400/10', iconColor: 'text-blue-500', link: '/customers' });
        }
        if (this.canSeeJobs && !this.jobsError()) {
            tiles.push({ label: 'Trabajos abiertos', value: summary.open, icon: 'pi-briefcase', iconBox: 'bg-cyan-100 dark:bg-cyan-400/10', iconColor: 'text-cyan-500', link: '/jobs' });
            // «Mis trabajos» tiene sentido para quien los ejecuta (un técnico, un responsable): es lo primero que quiere ver.
            if (this.canExecute && this.session.membershipId()) {
                tiles.push({ label: 'Asignados a mí', value: summary.assignedToMe, icon: 'pi-user', iconBox: 'bg-teal-100 dark:bg-teal-400/10', iconColor: 'text-teal-500', link: '/jobs', queryParams: { mine: '1' } });
            }
            tiles.push({ label: 'En curso', value: summary.inProgress, icon: 'pi-play', iconBox: 'bg-green-100 dark:bg-green-400/10', iconColor: 'text-green-500', link: '/jobs' });
            tiles.push({ label: 'Urgentes y altas', value: summary.highPriority, icon: 'pi-exclamation-triangle', iconBox: 'bg-orange-100 dark:bg-orange-400/10', iconColor: 'text-orange-500', link: '/jobs' });
            // Repartir trabajo es cosa de quien puede asignar: para el resto, "sin asignar" no es una acción suya.
            if (this.canAssign) {
                tiles.push({ label: 'Sin asignar', value: summary.unassigned, icon: 'pi-user-minus', iconBox: 'bg-purple-100 dark:bg-purple-400/10', iconColor: 'text-purple-500', link: '/jobs' });
            }
        }
        return tiles;
    });

    readonly statusRows = computed(() => {
        const { byStatus, total } = this.summary();
        return (Object.keys(JOB_STATUS_LABELS) as JobStatus[]).map((status) => ({
            status,
            label: JOB_STATUS_LABELS[status],
            count: byStatus[status],
            percent: percentOf(byStatus[status], total)
        }));
    });

    readonly attention = computed(() => this.summary().attention.map((job) => ({ ...job, customerName: this.customerNames().get(job.customerId) ?? '—' })));

    // Empresa recién creada: ni un cliente ni un trabajo. Se le dice por dónde empezar en vez de enseñarle ceros.
    readonly isEmpty = computed(() => !this.loading() && !this.customersError() && !this.jobsError() && this.customers().length === 0 && this.jobs().length === 0);

    ngOnInit(): void {
        this.load();
    }

    load(): void {
        this.loading.set(true);
        forkJoin({
            customers: this.canSeeCustomers ? this.customerService.list() : of(null),
            jobs: this.canSeeJobs ? this.jobService.list() : of(null)
        }).subscribe(({ customers, jobs }) => {
            this.customers.set(customers?.data ?? []);
            this.jobs.set(jobs?.data ?? []);
            this.customersError.set(customers && !customers.isSuccess ? customers.message : null);
            this.jobsError.set(jobs && !jobs.isSuccess ? jobs.message : null);
            this.loading.set(false);
        });
    }

    statusLabel(status: JobStatus): string {
        return JOB_STATUS_LABELS[status] ?? status;
    }

    priorityLabel(priority: Job['priority']): string {
        return JOB_PRIORITY_LABELS[priority] ?? priority;
    }

    readonly statusSeverity = jobStatusSeverity;
    readonly prioritySeverity = jobPrioritySeverity;
}
