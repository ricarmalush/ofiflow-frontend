import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterModule } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { TagModule } from 'primeng/tag';
import { ToolbarModule } from 'primeng/toolbar';
import { CLOCK } from '../../../../core/services/clock';
import { CurrentSessionService } from '../../../../core/services/current-session';
import { formatTime } from '../../../../core/utils/local-datetime.util';
import { JOB_STATUS_LABELS, Job, JobStatus, TagSeverity, isOverdue, jobStatusSeverity } from '../../../../shared/models/job.model';
import { CustomerService } from '../../../customers/services/customer.service';
import { JobService } from '../../../jobs/services/job.service';
import { TeamService } from '../../../team/services/team.service';
import { addDays, dayKey, startOfWeek, weekDays, weekRange } from '../../week-range.util';

// Un trabajo tal como se pinta en la agenda: con los nombres ya resueltos y la hora local.
export interface AgendaCard extends Job {
    time: string;
    customerName: string;
    assigneeName: string;
    overdue: boolean;
}

export interface AgendaDay {
    date: Date;
    key: string;
    isToday: boolean;
    cards: AgendaCard[];
}

const WEEKDAY = new Intl.DateTimeFormat('es-ES', { weekday: 'long' });
const DAY_MONTH = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' });
const DAY_MONTH_YEAR = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });

// La agenda de la semana (spec 020 F1 a F4 y F8): de lunes a domingo, en la hora del navegador. Pide a la API los trabajos con fecha entre
// la medianoche local del lunes y la del lunes siguiente, y los reparte por día LOCAL.
@Component({
    selector: 'app-agenda',
    standalone: true,
    imports: [RouterModule, ButtonModule, MessageModule, TagModule, ToolbarModule],
    templateUrl: './agenda.component.html'
})
export class AgendaComponent implements OnInit {
    private jobService = inject(JobService);
    private customerService = inject(CustomerService);
    private teamService = inject(TeamService);
    private session = inject(CurrentSessionService);
    private clock = inject(CLOCK);

    readonly weekStart = signal(startOfWeek(this.clock()));
    private readonly jobs = signal<Job[]>([]);
    private readonly customerNames = signal(new Map<string, string>());
    private readonly memberNames = signal(new Map<string, string>());

    readonly loading = signal(false);
    readonly errorMessage = signal<string | null>(null);
    readonly onlyMine = signal(false);

    // Cada cambio de semana pide de nuevo a la API; si la persona pulsa «Siguiente» deprisa, solo vale la respuesta de la última petición.
    private requestId = 0;

    // La tarjeta lleva al formulario del trabajo solo con Jobs.Write (la ruta lo exige); sin él es texto, como en la lista.
    readonly canWrite = computed(() => this.session.can('Jobs.Write'));
    // Sin Users.Read la API no deja listar el equipo: el asignado se ve como «Asignado», sin nombre.
    private readonly canSeeTeam = computed(() => this.session.can('Users.Read'));
    // El Id de MI pertenencia: con él se sabe qué trabajos son míos aunque no pueda listar el equipo.
    readonly myMembershipId = this.session.membershipId;

    readonly days = computed<AgendaDay[]>(() => {
        const customers = this.customerNames();
        const members = this.memberNames();
        const me = this.myMembershipId();
        const onlyMine = this.onlyMine();
        const now = this.clock();
        const todayKey = dayKey(now);

        const byDay = new Map<string, AgendaCard[]>();
        for (const job of this.jobs()) {
            if (!job.scheduledDate) {
                continue;
            }
            // «Solo mis trabajos» sin saber cuál es mi pertenencia no enseña nada, en vez de adivinar.
            if (onlyMine && (!me || job.assignedTenantUserId !== me)) {
                continue;
            }

            const key = dayKey(new Date(job.scheduledDate));
            const card: AgendaCard = {
                ...job,
                time: formatTime(job.scheduledDate),
                customerName: customers.get(job.customerId) ?? '—',
                assigneeName: !job.assignedTenantUserId ? 'Sin asignar' : me && job.assignedTenantUserId === me ? 'Tú' : (members.get(job.assignedTenantUserId) ?? 'Asignado'),
                overdue: isOverdue(job, now)
            };
            byDay.set(key, [...(byDay.get(key) ?? []), card]);
        }

        return weekDays(this.weekStart()).map((date) => ({ date, key: dayKey(date), isToday: dayKey(date) === todayKey, cards: byDay.get(dayKey(date)) ?? [] }));
    });

    readonly hasJobs = computed(() => this.days().some((day) => day.cards.length > 0));

    // «9 nov – 15 nov 2026»
    readonly weekLabel = computed(() => {
        const monday = this.weekStart();
        return `${DAY_MONTH.format(monday)} – ${DAY_MONTH_YEAR.format(addDays(monday, 6))}`;
    });

    readonly isCurrentWeek = computed(() => dayKey(this.weekStart()) === dayKey(startOfWeek(this.clock())));

    ngOnInit(): void {
        this.loadNames();
        this.load();
    }

    previousWeek(): void {
        this.goTo(addDays(this.weekStart(), -7));
    }

    nextWeek(): void {
        this.goTo(addDays(this.weekStart(), 7));
    }

    today(): void {
        this.goTo(startOfWeek(this.clock()));
    }

    weekdayName(day: AgendaDay): string {
        return WEEKDAY.format(day.date);
    }

    dayLabel(day: AgendaDay): string {
        return DAY_MONTH.format(day.date);
    }

    statusLabel(status: JobStatus): string {
        return JOB_STATUS_LABELS[status] ?? status;
    }

    statusSeverity(status: JobStatus): TagSeverity {
        return jobStatusSeverity(status);
    }

    load(): void {
        const id = ++this.requestId;
        const { from, to } = weekRange(this.weekStart());
        this.loading.set(true);
        this.errorMessage.set(null);

        this.jobService.agenda(from, to).subscribe((result) => {
            if (id !== this.requestId) {
                return; // llegó tarde: la persona ya cambió de semana
            }
            this.loading.set(false);
            this.jobs.set(result.data ?? []);
            this.errorMessage.set(result.isSuccess ? null : result.message);
        });
    }

    private goTo(monday: Date): void {
        this.weekStart.set(monday);
        this.load();
    }

    // Los nombres de clientes y del equipo no cambian de una semana a otra: se piden una vez. Si fallan, la agenda sigue siendo útil
    // (se ve «—» y «Asignado»), así que no es un error de la pantalla.
    private loadNames(): void {
        this.customerService.list().subscribe((result) => this.customerNames.set(new Map((result.data ?? []).map((c) => [c.id, c.name]))));
        if (this.canSeeTeam()) {
            this.teamService.list().subscribe((result) => this.memberNames.set(new Map((result.data ?? []).map((m) => [m.id, m.name]))));
        }
    }
}
