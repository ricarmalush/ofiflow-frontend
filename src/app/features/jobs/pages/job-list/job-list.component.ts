import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { Table, TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToolbarModule } from 'primeng/toolbar';
import { forkJoin, of } from 'rxjs';
import { CurrentSessionService } from '../../../../core/services/current-session';
import { escapeHtml } from '../../../../core/utils/escape-html.util';
import { Job, JOB_PRIORITY_LABELS, JOB_STATUS_LABELS, JobPriority, JobStatus, canCancel, canComplete, canStart } from '../../../../shared/models/job.model';
import { CustomerService } from '../../../customers/services/customer.service';
import { TeamService } from '../../../team/services/team.service';
import { JobService, JobTransition } from '../../services/job.service';

// Fila de la tabla: el trabajo más los nombres ya resueltos, para poder buscar y ordenar por ellos.
interface JobRow extends Job {
    customerName: string;
    assigneeName: string;
}

const TRANSITION_TEXT: Record<JobTransition, { done: string; failed: string }> = {
    start: { done: 'Trabajo iniciado', failed: 'No se pudo iniciar' },
    complete: { done: 'Trabajo completado', failed: 'No se pudo completar' },
    cancel: { done: 'Trabajo cancelado', failed: 'No se pudo cancelar' }
};

@Component({
    selector: 'app-job-list',
    standalone: true,
    imports: [RouterModule, FormsModule, TableModule, ButtonModule, TagModule, ToolbarModule, MessageModule, IconFieldModule, InputIconModule, InputTextModule, SelectModule],
    templateUrl: './job-list.component.html'
})
export class JobListComponent implements OnInit {
    private jobService = inject(JobService);
    private customerService = inject(CustomerService);
    private teamService = inject(TeamService);
    private messageService = inject(MessageService);
    private confirmationService = inject(ConfirmationService);
    private session = inject(CurrentSessionService);

    private readonly jobs = signal<Job[]>([]);
    private readonly customerNames = signal(new Map<string, string>());
    private readonly memberNames = signal(new Map<string, string>());

    readonly loading = signal(false);
    readonly errorMessage = signal<string | null>(null);
    readonly busyJobId = signal<string | null>(null);
    readonly statusFilter = signal<JobStatus | null>(null);

    readonly canWrite = this.session.can('Jobs.Write');
    readonly canExecute = this.session.can('Jobs.Execute');
    readonly canCancelJobs = this.session.can('Jobs.Cancel');
    // Sin Users.Read (Employee, Technician) la API no deja listar el equipo: el asignado se ve
    // como "Asignado", sin nombre.
    private readonly canSeeTeam = this.session.can('Users.Read');

    readonly statusOptions = (Object.keys(JOB_STATUS_LABELS) as JobStatus[]).map((value) => ({ label: JOB_STATUS_LABELS[value], value }));

    readonly rows = computed<JobRow[]>(() => {
        const customers = this.customerNames();
        const members = this.memberNames();
        const status = this.statusFilter();
        return this.jobs()
            .filter((job) => !status || job.status === status)
            .map((job) => ({
                ...job,
                customerName: customers.get(job.customerId) ?? '—',
                assigneeName: !job.assignedTenantUserId ? 'Sin asignar' : (members.get(job.assignedTenantUserId) ?? 'Asignado')
            }));
    });

    readonly canStart = canStart;
    readonly canComplete = canComplete;
    readonly canCancel = canCancel;

    ngOnInit(): void {
        this.loading.set(true);
        forkJoin({
            jobs: this.jobService.list(),
            customers: this.customerService.list(),
            members: this.canSeeTeam ? this.teamService.list() : of(null)
        }).subscribe(({ jobs, customers, members }) => {
            this.loading.set(false);
            this.jobs.set(jobs.data ?? []);
            this.customerNames.set(new Map((customers.data ?? []).map((c) => [c.id, c.name])));
            this.memberNames.set(new Map((members?.data ?? []).map((m) => [m.id, m.name])));
            this.errorMessage.set(jobs.isSuccess ? null : jobs.message);
        });
    }

    statusLabel(status: JobStatus): string {
        return JOB_STATUS_LABELS[status] ?? status;
    }

    statusSeverity(status: JobStatus): 'info' | 'warn' | 'success' | 'secondary' | 'contrast' {
        switch (status) {
            case 'InProgress':
                return 'warn';
            case 'Completed':
                return 'success';
            case 'Cancelled':
                return 'secondary';
            default:
                return 'info';
        }
    }

    priorityLabel(priority: JobPriority): string {
        return JOB_PRIORITY_LABELS[priority] ?? priority;
    }

    prioritySeverity(priority: JobPriority): 'danger' | 'warn' | 'secondary' | 'contrast' {
        return priority === 'Urgent' ? 'danger' : priority === 'High' ? 'warn' : 'secondary';
    }

    onSearch(table: Table, event: Event): void {
        table.filterGlobal((event.target as HTMLInputElement).value, 'contains');
    }

    run(job: JobRow, transition: JobTransition): void {
        if (transition !== 'cancel') {
            this.apply(job, transition);
            return;
        }
        this.confirmationService.confirm({
            header: 'Cancelar trabajo',
            message: `¿Cancelar "${escapeHtml(job.title)}"? Un trabajo cancelado no se puede reabrir.`,
            icon: 'pi pi-exclamation-triangle',
            acceptLabel: 'Cancelar trabajo',
            rejectLabel: 'Volver',
            acceptButtonStyleClass: 'p-button-danger',
            rejectButtonStyleClass: 'p-button-secondary p-button-text',
            accept: () => this.apply(job, 'cancel')
        });
    }

    // Tras cada acción se vuelve a pedir el trabajo en vez de suponer el estado nuevo: la
    // pantalla enseña lo que la API ha guardado de verdad.
    private apply(job: JobRow, transition: JobTransition): void {
        this.busyJobId.set(job.id);
        this.jobService.transition(job.id, transition).subscribe((result) => {
            const text = TRANSITION_TEXT[transition];
            this.messageService.add({
                severity: result.isSuccess ? 'success' : 'error',
                summary: result.isSuccess ? text.done : text.failed,
                detail: result.isSuccess ? job.title : result.message
            });
            this.jobService.get(job.id).subscribe((fresh) => {
                this.busyJobId.set(null);
                if (fresh.data) {
                    const updated = fresh.data;
                    this.jobs.update((list) => list.map((j) => (j.id === updated.id ? updated : j)));
                }
            });
        });
    }
}
