// Espejo TS de JobDto y de los enums de OfiFlow.Domain.Jobs.

export type JobStatus = 'New' | 'Pending' | 'Scheduled' | 'InProgress' | 'Completed' | 'Cancelled';
export type JobPriority = 'Low' | 'Normal' | 'High' | 'Urgent';

export const JOB_STATUS_LABELS: Readonly<Record<JobStatus, string>> = {
    New: 'Nuevo',
    Pending: 'Pendiente',
    Scheduled: 'Programado',
    InProgress: 'En curso',
    Completed: 'Completado',
    Cancelled: 'Cancelado'
};

export const JOB_PRIORITY_LABELS: Readonly<Record<JobPriority, string>> = {
    Low: 'Baja',
    Normal: 'Normal',
    High: 'Alta',
    Urgent: 'Urgente'
};

export type TagSeverity = 'info' | 'warn' | 'success' | 'secondary' | 'contrast' | 'danger';

// Cómo se pinta cada estado y cada prioridad. Está aquí, y no en cada pantalla, para que la lista
// de trabajos y el dashboard muestren lo mismo del mismo modo.
export function jobStatusSeverity(status: JobStatus): TagSeverity {
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

export function jobPrioritySeverity(priority: JobPriority): TagSeverity {
    return priority === 'Urgent' ? 'danger' : priority === 'High' ? 'warn' : 'secondary';
}

// Límites de OfiFlow.Domain.Jobs.Job.
export const JOB_LIMITS = {
    titleMaxLength: 200,
    descriptionMaxLength: 2000
} as const;

// Transiciones de Job (Schedule, Unschedule, Start, Complete, Cancel en el Domain). Solo deciden qué botón se
// ofrece; si el estado cambió entre tanto, la API responde 400 con su mensaje y la pantalla lo muestra.
// Un trabajo se inicia desde New o desde Scheduled (spec 020 R8): muchos servicios no se planifican.
export const canStart = (status: JobStatus) => status === 'New' || status === 'Scheduled';
export const canComplete = (status: JobStatus) => status === 'InProgress';
export const canCancel = (status: JobStatus) => status !== 'Completed' && status !== 'Cancelled';
// Programar es para un trabajo nuevo o ya programado (reprogramar); quitarlo de la agenda, solo si está programado.
export const canSchedule = (status: JobStatus) => status === 'New' || status === 'Scheduled';
export const canUnschedule = (status: JobStatus) => status === 'Scheduled';

// Límites de la programación (spec 020 R6): la duración es un número entero de minutos, de 1 a 1440 (un día).
export const SCHEDULE_LIMITS = {
    minMinutes: 1,
    maxMinutes: 1440
} as const;

export interface Job {
    id: string;
    customerId: string;
    title: string;
    description: string | null;
    status: JobStatus;
    priority: JobPriority;
    scheduledDate: string | null;
    assignedTenantUserId: string | null;
    estimatedDurationMinutes: number | null;
}

export interface JobInput {
    title: string;
    description: string | null;
    priority: JobPriority;
}

// «Vencido»: un trabajo que sigue PROGRAMADO cuando su hora ya pasó, es decir, que nadie ha empezado. Uno en curso no lo está
// (se está haciendo, aunque tarde) y uno completado o cancelado ya no espera nada.
export function isOverdue(job: Pick<Job, 'status' | 'scheduledDate'>, now: Date): boolean {
    return job.status === 'Scheduled' && !!job.scheduledDate && new Date(job.scheduledDate).getTime() < now.getTime();
}
