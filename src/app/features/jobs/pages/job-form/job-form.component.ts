import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';
import { Observable, forkJoin, of } from 'rxjs';
import { CurrentSessionService } from '../../../../core/services/current-session';
import { localInputToUtcIso, utcIsoToLocalInput } from '../../../../core/utils/local-datetime.util';
import { Customer } from '../../../../shared/models/customer.model';
import { JOB_LIMITS, JOB_PRIORITY_LABELS, JOB_STATUS_LABELS, JobInput, JobPriority, JobStatus, SCHEDULE_LIMITS, canSchedule, canUnschedule } from '../../../../shared/models/job.model';
import { FieldError } from '../../../../shared/models/problem-details.model';
import { OperationResult } from '../../../../shared/models/result.model';
import { TeamMember } from '../../../../shared/models/team-member.model';
import { CustomerService } from '../../../customers/services/customer.service';
import { TeamService } from '../../../team/services/team.service';
import { JobService } from '../../services/job.service';

type FieldName = 'customerId' | 'title' | 'description';

// Alta (/jobs/new) y edición (/jobs/:id). La asignación va aparte, con su propio botón, porque
// en la API es otra acción con otro permiso (Jobs.Assign) y no forma parte del PUT.
@Component({
    selector: 'app-job-form',
    standalone: true,
    imports: [ReactiveFormsModule, FormsModule, RouterModule, ButtonModule, InputTextModule, TextareaModule, SelectModule, MessageModule, TagModule],
    templateUrl: './job-form.component.html'
})
export class JobFormComponent implements OnInit {
    private fb = inject(FormBuilder);
    private route = inject(ActivatedRoute);
    private router = inject(Router);
    private jobService = inject(JobService);
    private customerService = inject(CustomerService);
    private teamService = inject(TeamService);
    private messageService = inject(MessageService);
    private session = inject(CurrentSessionService);

    readonly limits = JOB_LIMITS;
    readonly priorityOptions = (Object.keys(JOB_PRIORITY_LABELS) as JobPriority[]).map((value) => ({ label: JOB_PRIORITY_LABELS[value], value }));

    // Asignar exige Jobs.Assign y, para elegir a quién, poder ver el equipo (Users.Read).
    readonly canAssign = computed(() => this.session.can('Jobs.Assign') && this.session.can('Users.Read'));

    // Programar exige Jobs.Schedule (spec 020 D4). Ver la agenda es Jobs.Read; mover un trabajo en ella, no.
    readonly canScheduleJobs = computed(() => this.session.can('Jobs.Schedule'));
    readonly scheduleLimits = SCHEDULE_LIMITS;

    readonly jobId = signal<string | null>(null);
    readonly status = signal<JobStatus | null>(null);
    readonly customers = signal<Customer[]>([]);
    readonly members = signal<TeamMember[]>([]);
    readonly loading = signal(false);
    readonly saving = signal(false);
    readonly assigning = signal(false);
    readonly errorMessage = signal<string | null>(null);

    assigneeId: string | null = null;
    private savedAssigneeId: string | null = null;

    // Programación (spec 020 F5). La fecha es la hora de pared del navegador (<input type=datetime-local>); se convierte a UTC al enviar.
    scheduleAt = '';
    scheduleMinutes: number | null = null;
    readonly scheduling = signal(false);
    readonly scheduleError = signal<string | null>(null);
    readonly scheduleDateError = signal<string | null>(null);
    readonly scheduleMinutesError = signal<string | null>(null);

    // Solo se programa un trabajo nuevo o ya programado; en otro estado la sección se ve desactivada, y dice por qué.
    readonly scheduleLocked = computed(() => {
        const status = this.status();
        return status === null || !canSchedule(status);
    });
    readonly scheduleLockedReason = computed(() => {
        const status = this.status();
        return status !== null && !canSchedule(status) ? `No se puede programar un trabajo ${JOB_STATUS_LABELS[status].toLowerCase()}.` : null;
    });
    readonly canRemoveFromAgenda = computed(() => {
        const status = this.status();
        return status !== null && canUnschedule(status);
    });

    readonly form = this.fb.nonNullable.group({
        customerId: ['', [Validators.required]],
        title: ['', [Validators.required, Validators.maxLength(JOB_LIMITS.titleMaxLength)]],
        description: ['', [Validators.maxLength(JOB_LIMITS.descriptionMaxLength)]],
        priority: this.fb.nonNullable.control<JobPriority>('Normal')
    });

    ngOnInit(): void {
        const id = this.route.snapshot.paramMap.get('id');
        this.jobId.set(id);
        if (id) {
            // El cliente de un trabajo no cambia: UpdateJob solo toca título, descripción y prioridad.
            this.form.controls.customerId.disable();
        }

        this.loading.set(true);
        forkJoin({
            customers: this.customerService.list(),
            members: this.canAssign() && id ? this.teamService.list() : of(null),
            job: id ? this.jobService.get(id) : of(null)
        }).subscribe(({ customers, members, job }) => {
            this.loading.set(false);
            this.customers.set(customers.data ?? []);
            this.members.set(members?.data ?? []);

            if (job && !job.isSuccess) {
                this.errorMessage.set(job.message);
                this.form.disable();
                return;
            }
            if (job?.data) {
                const j = job.data;
                this.status.set(j.status);
                this.form.patchValue({ customerId: j.customerId, title: j.title, description: j.description ?? '', priority: j.priority });
                this.assigneeId = this.savedAssigneeId = j.assignedTenantUserId;
                this.scheduleAt = utcIsoToLocalInput(j.scheduledDate);
                this.scheduleMinutes = j.estimatedDurationMinutes;
            }
        });
    }

    statusLabel(status: JobStatus): string {
        return JOB_STATUS_LABELS[status] ?? status;
    }

    assigneeChanged(): boolean {
        return !!this.assigneeId && this.assigneeId !== this.savedAssigneeId;
    }

    save(): void {
        if (this.form.invalid || this.saving()) {
            this.form.markAllAsTouched();
            return;
        }
        this.saving.set(true);
        this.errorMessage.set(null);

        const v = this.form.getRawValue();
        const input: JobInput = { title: v.title.trim(), description: v.description.trim() || null, priority: v.priority };
        const id = this.jobId();
        const request: Observable<OperationResult<unknown>> = id ? this.jobService.update(id, input) : this.jobService.create(v.customerId, input);

        request.subscribe((result) => {
            this.saving.set(false);
            if (result.isSuccess) {
                this.messageService.add({ severity: 'success', summary: id ? 'Trabajo actualizado' : 'Trabajo creado', detail: input.title });
                this.router.navigate(['/jobs']);
                return;
            }
            this.errorMessage.set(result.message);
            this.applyFieldErrors(result.fieldErrors);
        });
    }

    assign(): void {
        const id = this.jobId();
        if (!id || !this.assigneeId || this.assigning()) {
            return;
        }
        this.assigning.set(true);
        const assigneeId = this.assigneeId;
        this.jobService.assign(id, assigneeId).subscribe((result) => {
            this.assigning.set(false);
            if (result.isSuccess) {
                this.savedAssigneeId = assigneeId;
            }
            this.messageService.add({
                severity: result.isSuccess ? 'success' : 'error',
                summary: result.isSuccess ? 'Trabajo asignado' : 'No se pudo asignar',
                detail: result.isSuccess ? this.members().find((m) => m.id === assigneeId)?.name : result.message
            });
        });
    }

    schedule(): void {
        const id = this.jobId();
        if (!id || this.scheduling() || this.scheduleLocked()) {
            return;
        }

        this.scheduleError.set(null);
        this.scheduleDateError.set(null);
        this.scheduleMinutesError.set(null);

        const scheduledDateUtc = localInputToUtcIso(this.scheduleAt);
        if (!scheduledDateUtc) {
            this.scheduleDateError.set('Indica la fecha y la hora.');
            return;
        }

        const minutes = this.scheduleMinutes;
        if (minutes !== null && (!Number.isInteger(minutes) || minutes < SCHEDULE_LIMITS.minMinutes || minutes > SCHEDULE_LIMITS.maxMinutes)) {
            this.scheduleMinutesError.set(`La duración son minutos enteros, de ${SCHEDULE_LIMITS.minMinutes} a ${SCHEDULE_LIMITS.maxMinutes}.`);
            return;
        }

        const wasScheduled = this.canRemoveFromAgenda();
        this.scheduling.set(true);
        this.jobService.schedule(id, scheduledDateUtc, minutes).subscribe((result) => {
            this.scheduling.set(false);
            if (!result.isSuccess) {
                // Lo que la persona escribió se conserva: solo se enseña por qué la API no lo aceptó.
                this.scheduleError.set(result.message);
                this.applyScheduleFieldErrors(result.fieldErrors);
                return;
            }
            this.messageService.add({ severity: 'success', summary: wasScheduled ? 'Trabajo reprogramado' : 'Trabajo programado', detail: this.form.controls.title.value });
            this.reloadJob(id);
        });
    }

    unschedule(): void {
        const id = this.jobId();
        if (!id || this.scheduling() || !this.canRemoveFromAgenda()) {
            return;
        }

        this.scheduleError.set(null);
        this.scheduleDateError.set(null);
        this.scheduleMinutesError.set(null);
        this.scheduling.set(true);
        this.jobService.unschedule(id).subscribe((result) => {
            this.scheduling.set(false);
            if (!result.isSuccess) {
                this.scheduleError.set(result.message);
                return;
            }
            this.messageService.add({ severity: 'success', summary: 'Trabajo quitado de la agenda', detail: this.form.controls.title.value });
            this.reloadJob(id);
        });
    }

    hasError(field: FieldName): boolean {
        const control = this.form.controls[field];
        return control.invalid && (control.touched || !!control.errors?.['api']);
    }

    errorText(field: FieldName): string {
        const errors = this.form.controls[field].errors ?? {};
        if (errors['api']) return errors['api'];
        if (errors['required']) return 'Obligatorio.';
        if (errors['maxlength']) return `Máximo ${errors['maxlength'].requiredLength} caracteres.`;
        return '';
    }

    // Tras programar o desprogramar se vuelve a pedir el trabajo, en vez de suponer cómo quedó: la pantalla enseña lo que la API guardó.
    private reloadJob(id: string): void {
        this.jobService.get(id).subscribe((result) => {
            if (!result.isSuccess || !result.data) {
                this.scheduleError.set(result.message);
                return;
            }
            const job = result.data;
            this.status.set(job.status);
            this.scheduleAt = utcIsoToLocalInput(job.scheduledDate);
            this.scheduleMinutes = job.estimatedDurationMinutes;
        });
    }

    private applyScheduleFieldErrors(fieldErrors: FieldError[] | undefined): void {
        for (const error of fieldErrors ?? []) {
            if (error.field === 'ScheduledDate') {
                this.scheduleDateError.set(error.message);
            } else if (error.field === 'EstimatedDurationMinutes') {
                this.scheduleMinutesError.set(error.message);
            }
        }
    }

    private applyFieldErrors(fieldErrors: FieldError[] | undefined): void {
        for (const error of fieldErrors ?? []) {
            const control = this.form.get(error.field.charAt(0).toLowerCase() + error.field.slice(1));
            control?.setErrors({ ...control.errors, api: error.message });
            control?.markAsTouched();
        }
    }
}
