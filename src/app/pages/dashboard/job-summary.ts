import { Job, JobPriority, JobStatus } from '../../shared/models/job.model';

// Lógica del dashboard sin Angular: recibe los trabajos tal como los devuelve la API y calcula lo
// que se pinta. Así se prueba sin montar ningún componente, y la pantalla solo dibuja.

// "Abierto" = todavía hay trabajo que hacer. Completado y Cancelado son finales (Job.Complete y
// Job.Cancel del Domain no tienen vuelta atrás).
export const OPEN_STATUSES: readonly JobStatus[] = ['New', 'Pending', 'Scheduled', 'InProgress'];

// Cuántos trabajos se enseñan en "Requieren atención": es un vistazo, no el listado (para eso está /jobs).
export const ATTENTION_LIMIT = 8;

const PRIORITY_RANK: Readonly<Record<JobPriority, number>> = { Low: 0, Normal: 1, High: 2, Urgent: 3 };

export interface JobSummary {
    total: number;
    open: number;
    inProgress: number;
    // Abiertos que nadie tiene asignados: lo que un gestor tiene que repartir.
    unassigned: number;
    // Abiertos con prioridad Alta o Urgente.
    highPriority: number;
    byStatus: Readonly<Record<JobStatus, number>>;
    // Los abiertos Urgentes o Altos, los más urgentes primero y, a igualdad, los que ya están en curso.
    attention: Job[];
}

export const isOpen = (job: Job): boolean => OPEN_STATUSES.includes(job.status);

const isHighPriority = (job: Job): boolean => job.priority === 'High' || job.priority === 'Urgent';

export function summarizeJobs(jobs: readonly Job[]): JobSummary {
    const byStatus: Record<JobStatus, number> = { New: 0, Pending: 0, Scheduled: 0, InProgress: 0, Completed: 0, Cancelled: 0 };
    for (const job of jobs) {
        // Un estado que el frontend no conoce (la API añadió uno) no rompe el resumen: cuenta en el total, no en el reparto.
        if (job.status in byStatus) {
            byStatus[job.status]++;
        }
    }

    const open = jobs.filter(isOpen);

    return {
        total: jobs.length,
        open: open.length,
        inProgress: byStatus.InProgress,
        unassigned: open.filter((job) => !job.assignedTenantUserId).length,
        highPriority: open.filter(isHighPriority).length,
        byStatus,
        attention: open
            .filter(isHighPriority)
            .sort(
                (a, b) =>
                    PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority] ||
                    Number(b.status === 'InProgress') - Number(a.status === 'InProgress') ||
                    a.title.localeCompare(b.title, 'es')
            )
            .slice(0, ATTENTION_LIMIT)
    };
}

// Porcentaje de una parte sobre el total para las barras, redondeado y sin salirse de 0-100. Con
// total 0 devuelve 0 (no hay nada que repartir) en vez de NaN.
export function percentOf(part: number, total: number): number {
    return total <= 0 ? 0 : Math.min(100, Math.max(0, Math.round((part / total) * 100)));
}
