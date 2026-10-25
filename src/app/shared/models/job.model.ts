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

// Límites de OfiFlow.Domain.Jobs.Job.
export const JOB_LIMITS = {
    titleMaxLength: 200,
    descriptionMaxLength: 2000
} as const;

// Transiciones de Job (Start, Complete, Cancel en el Domain). Solo deciden qué botón se ofrece;
// si el estado cambió entre tanto, la API responde 400 con su mensaje y la pantalla lo muestra.
export const canStart = (status: JobStatus) => status === 'New';
export const canComplete = (status: JobStatus) => status === 'InProgress';
export const canCancel = (status: JobStatus) => status !== 'Completed' && status !== 'Cancelled';

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
