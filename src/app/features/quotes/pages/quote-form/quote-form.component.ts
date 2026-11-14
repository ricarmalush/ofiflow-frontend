import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';
import { forkJoin, of } from 'rxjs';
import { QUOTE_CHANGED_MEANWHILE_CODE, QUOTE_COMPANY_PROFILE_INCOMPLETE_CODE } from '../../../../core/constants/api-error-codes';
import { CLOCK } from '../../../../core/services/clock';
import { CurrentSessionService } from '../../../../core/services/current-session';
import { FileDownloadService } from '../../../../core/services/file-download';
import { escapeHtml } from '../../../../core/utils/escape-html.util';
import { Customer } from '../../../../shared/models/customer.model';
import { Job } from '../../../../shared/models/job.model';
import { FieldError } from '../../../../shared/models/problem-details.model';
import {
    QUOTE_LIMITS,
    QUOTE_STATUS_LABELS,
    Quote,
    QuoteInput,
    QuoteStatus,
    QuoteTagSeverity,
    QuoteTransition,
    VAT_RATES,
    VatBreakdownLine,
    canDecideQuote,
    canEditQuote,
    canSendQuote,
    formatQuoteNumber,
    isQuoteExpired,
    quoteStatusSeverity
} from '../../../../shared/models/quote.model';
import { centsToEuros, computeQuoteTotals, eurosToCents, formatEuros, lineNetCents } from '../../../../shared/models/quote-totals';
import { CompanyService } from '../../../company/services/company.service';
import { CustomerService } from '../../../customers/services/customer.service';
import { JobService } from '../../../jobs/services/job.service';
import { QuoteService } from '../../services/quote.service';

// Una línea mientras se edita: lo que se teclea. El precio va en EUROS (lo que se teclea) y se pasa a céntimos al enviar; nada de esto se manda calculado.
export interface LineDraft {
    key: number;
    description: string;
    quantity: number | null;
    priceEuros: number | null;
    vatPercent: number;
}

export interface LineErrors {
    description?: string;
    quantity?: string;
    price?: string;
    vat?: string;
}

const TRANSITION_TEXT: Record<QuoteTransition, { confirm: string; done: string; failed: string; header: string; accept: string }> = {
    send: { header: 'Enviar presupuesto', confirm: 'Se marcará como enviado y dejará de poder modificarse ni eliminarse. Esto no lo manda al cliente: solo lo anota.', done: 'Presupuesto enviado', failed: 'No se pudo enviar', accept: 'Enviar' },
    accept: { header: 'Aceptar presupuesto', confirm: 'Se anotará como aceptado. Una vez resuelto no se puede reabrir.', done: 'Presupuesto aceptado', failed: 'No se pudo aceptar', accept: 'Aceptar' },
    reject: { header: 'Rechazar presupuesto', confirm: 'Se anotará como rechazado. Una vez resuelto no se puede reabrir.', done: 'Presupuesto rechazado', failed: 'No se pudo rechazar', accept: 'Rechazar' }
};

// Alta (/quotes/new) y edición o lectura (/quotes/:id) de un presupuesto (spec 023). Solo un BORRADOR se edita (con Quotes.Write); uno enviado, aceptado o rechazado se ve en solo lectura.
// Mientras se edita, el total es una VISTA PREVIA con la misma regla que el servidor (quote-totals); al guardar, lo que se enseña es lo que devuelve la API. Enviar, aceptar y rechazar
// son acciones con su propio permiso (Quotes.Issue), y quien edita con la versión vieja ve el conflicto en vez de pisar el trabajo de otro.
@Component({
    selector: 'app-quote-form',
    standalone: true,
    imports: [FormsModule, RouterModule, ButtonModule, InputTextModule, InputNumberModule, TextareaModule, SelectModule, MessageModule, TagModule],
    templateUrl: './quote-form.component.html'
})
export class QuoteFormComponent implements OnInit {
    private route = inject(ActivatedRoute);
    private router = inject(Router);
    private quoteService = inject(QuoteService);
    private customerService = inject(CustomerService);
    private jobService = inject(JobService);
    private messageService = inject(MessageService);
    private confirmationService = inject(ConfirmationService);
    private session = inject(CurrentSessionService);
    private clock = inject(CLOCK);
    private companyService = inject(CompanyService);
    private fileDownload = inject(FileDownloadService);

    readonly limits = QUOTE_LIMITS;
    readonly vatOptions = VAT_RATES.map((rate) => ({ label: `${rate} %`, value: rate as number }));
    readonly formatEuros = formatEuros;
    readonly formatQuoteNumber = formatQuoteNumber;

    readonly quoteId = signal<string | null>(null);
    // Lo guardado en el servidor, tal cual lo devolvió la API.
    readonly quote = signal<Quote | null>(null);
    // La versión del presupuesto que hay AHORA en el servidor cuando alguien lo cambió mientras tanto (para «guardar de todos modos» o «cargar la suya»).
    readonly latest = signal<Quote | null>(null);
    readonly customers = signal<Customer[]>([]);
    private readonly jobs = signal<Job[]>([]);

    // ¿Tiene la empresa sus datos fiscales? null = no se sabe (no se pudo preguntar o no hay permiso para verlos). Sin ellos la API no genera el PDF (spec 025 R3).
    readonly profileComplete = signal<boolean | null>(null);
    readonly downloadingPdf = signal(false);

    readonly loading = signal(false);
    readonly busy = signal(false);
    readonly submitted = signal(false);
    readonly errorMessage = signal<string | null>(null);
    readonly fieldErrors = signal<FieldError[]>([]);

    // Los campos que se editan.
    readonly customerId = signal<string | null>(null);
    readonly jobId = signal<string | null>(null);
    readonly title = signal('');
    readonly notes = signal('');
    readonly validUntil = signal('');
    readonly lines = signal<LineDraft[]>([]);
    private nextKey = 1;

    // Lo último que se guardó (o se cargó), para saber si hay cambios sin guardar.
    private readonly savedSnapshot = signal('');

    readonly isNew = computed(() => this.quoteId() === null);
    readonly canWrite = computed(() => this.session.can('Quotes.Write'));
    readonly canIssue = computed(() => this.session.can('Quotes.Issue'));
    readonly canManageCompany = computed(() => this.session.can('Company.Manage'));
    readonly status = computed<QuoteStatus>(() => this.quote()?.status ?? 'Draft');
    readonly statusLabel = computed(() => QUOTE_STATUS_LABELS[this.status()]);
    readonly statusSeverity = computed<QuoteTagSeverity>(() => quoteStatusSeverity(this.status()));
    readonly expired = computed(() => {
        const quote = this.quote();
        return !!quote && isQuoteExpired(quote.validUntil, quote.status, this.clock());
    });

    // Se edita solo un borrador y solo con Quotes.Write; todo lo demás es lectura.
    readonly readOnly = computed(() => !this.canWrite() || (!this.isNew() && !canEditQuote(this.status())));
    readonly canAddLine = computed(() => !this.readOnly() && this.lines().length < QUOTE_LIMITS.maxItems);

    readonly customerOptions = computed(() => this.customers().map((customer) => ({ label: customer.name, value: customer.id })));
    // El trabajo es opcional y tiene que ser del MISMO cliente (spec 023 R1): se ofrecen solo los de ese cliente. Sin Jobs.Read no se ofrece nada.
    readonly jobOptions = computed(() =>
        this.jobs()
            .filter((job) => job.customerId === this.customerId())
            .map((job) => ({ label: job.title, value: job.id }))
    );
    readonly canChooseJob = computed(() => this.session.can('Jobs.Read'));

    readonly headerErrors = computed(() => {
        const errors: { customer?: string; title?: string; notes?: string; validUntil?: string } = {};
        if (this.isNew() && !this.customerId()) {
            errors.customer = 'Elige un cliente.';
        }
        const title = this.title().trim();
        if (!title) {
            errors.title = 'El título es obligatorio.';
        } else if (title.length > QUOTE_LIMITS.titleMaxLength) {
            errors.title = `Máximo ${QUOTE_LIMITS.titleMaxLength} caracteres.`;
        }
        if (this.notes().length > QUOTE_LIMITS.notesMaxLength) {
            errors.notes = `Máximo ${QUOTE_LIMITS.notesMaxLength} caracteres.`;
        }
        const validUntil = this.validUntil();
        if (validUntil && (validUntil < '2000-01-01' || validUntil > '2099-12-31')) {
            errors.validUntil = 'La fecha debe estar entre los años 2000 y 2099.';
        }
        return errors;
    });

    readonly lineErrors = computed<LineErrors[]>(() => this.lines().map((line) => this.validateLine(line)));

    readonly formValid = computed(() => Object.keys(this.headerErrors()).length === 0 && this.lineErrors().every((errors) => Object.keys(errors).length === 0));

    // El cambio sin guardar: lo que hay en pantalla frente a lo último guardado.
    readonly dirty = computed(() => this.isNew() || this.snapshot() !== this.savedSnapshot());

    // Las líneas que ya tienen números válidos entran en la vista previa aunque a otra le falte la descripción.
    private readonly computableLines = computed(() =>
        this.lines()
            .filter((line) => this.quantityError(line) === undefined && this.priceError(line) === undefined && this.vatError(line) === undefined)
            .map((line) => ({ quantity: line.quantity as number, unitPriceCents: eurosToCents(line.priceEuros as number), vatPercent: line.vatPercent }))
    );
    readonly previewTotals = computed(() => computeQuoteTotals(this.computableLines()));

    // Mientras se edita (o hay cambios sin guardar), la vista previa; guardado o en lectura, lo que dice el servidor.
    readonly isPreview = computed(() => !this.readOnly() && this.dirty());
    readonly shownTotals = computed<{ netCents: number; vatCents: number; totalCents: number; breakdown: VatBreakdownLine[] }>(() => {
        const quote = this.quote();
        if (quote && !this.isPreview()) {
            return { netCents: quote.netCents, vatCents: quote.vatCents, totalCents: quote.totalCents, breakdown: quote.vatBreakdown };
        }
        return this.previewTotals();
    });

    // Se puede enviar un borrador guardado, sin cambios pendientes y con al menos una línea: lo que se envía es lo que está guardado.
    readonly canSend = computed(() => canSendQuote(this.status()) && !this.isNew() && this.canIssue() && !this.dirty() && (this.quote()?.items.length ?? 0) > 0);
    readonly showSend = computed(() => !this.isNew() && canSendQuote(this.status()) && this.canIssue());
    readonly showDecide = computed(() => canDecideQuote(this.status()) && this.canIssue());
    // El PDF es el del presupuesto GUARDADO (spec 025): solo se ofrece cuando ya existe y con Quotes.Read, y no con cambios sin guardar (saldría sin ellos).
    readonly showPdf = computed(() => !this.isNew() && this.session.can('Quotes.Read'));
    readonly canDownloadPdf = computed(() => this.showPdf() && !this.dirty() && !this.busy() && !this.downloadingPdf());
    // El aviso de datos incompletos solo cuando se sabe seguro que faltan.
    readonly showProfileNotice = computed(() => this.showPdf() && this.profileComplete() === false);
    readonly showDelete = computed(() => !this.isNew() && canEditQuote(this.status()) && this.canWrite());

    ngOnInit(): void {
        const id = this.route.snapshot.paramMap.get('id');
        this.quoteId.set(id);

        this.loading.set(true);
        forkJoin({
            customers: this.session.can('Customers.Read') ? this.customerService.list() : of(null),
            jobs: this.session.can('Jobs.Read') ? this.jobService.list() : of(null),
            quote: id ? this.quoteService.get(id) : of(null),
            // Para avisar antes de que falten los datos fiscales (solo en un presupuesto que ya existe y para quien puede verlos: todo rol con Quotes.Read los ve).
            company: id && this.session.can('Quotes.Read') && this.session.can('Company.Read') ? this.companyService.get() : of(null)
        }).subscribe(({ customers, jobs, quote, company }) => {
            this.loading.set(false);
            this.customers.set(customers?.data ?? []);
            this.jobs.set(jobs?.data ?? []);
            this.profileComplete.set(company?.data ? company.data.isComplete : null);

            if (quote && !quote.isSuccess) {
                this.errorMessage.set(quote.message);
                return;
            }
            if (quote?.data) {
                this.applyQuote(quote.data);
            } else {
                this.lines.set([]);
                this.savedSnapshot.set('');
            }
        });
    }

    // ===== Cabecera =====

    setCustomer(customerId: string | null): void {
        this.customerId.set(customerId);
        // El trabajo elegido era de otro cliente: ya no vale.
        this.jobId.set(null);
    }

    // ===== Líneas =====

    addLine(): void {
        if (!this.canAddLine()) {
            return;
        }
        this.lines.update((lines) => [...lines, { key: this.nextKey++, description: '', quantity: 1, priceEuros: null, vatPercent: 21 }]);
    }

    removeLine(index: number): void {
        if (this.readOnly()) {
            return;
        }
        this.lines.update((lines) => lines.filter((_, i) => i !== index));
    }

    moveLine(index: number, delta: -1 | 1): void {
        const target = index + delta;
        if (this.readOnly() || target < 0 || target >= this.lines().length) {
            return;
        }
        this.lines.update((lines) => {
            const copy = [...lines];
            [copy[index], copy[target]] = [copy[target], copy[index]];
            return copy;
        });
    }

    setLine(index: number, patch: Partial<Omit<LineDraft, 'key'>>): void {
        if (this.readOnly()) {
            return;
        }
        this.lines.update((lines) => lines.map((line, i) => (i === index ? { ...line, ...patch } : line)));
    }

    // El neto de una línea, solo para enseñarlo mientras se edita (el servidor lo calcula al guardar).
    lineNetLabel(line: LineDraft): string {
        return this.quantityError(line) === undefined && this.priceError(line) === undefined ? formatEuros(lineNetCents(line.quantity as number, eurosToCents(line.priceEuros as number))) : '—';
    }

    // ===== Guardar =====

    save(): void {
        this.submitted.set(true);
        if (!this.formValid() || this.busy() || this.readOnly()) {
            return;
        }
        this.errorMessage.set(null);
        this.fieldErrors.set([]);
        const input = this.buildInput();

        this.busy.set(true);
        const id = this.quoteId();
        if (id === null) {
            this.quoteService.create(this.customerId() as string, input).subscribe((result) => {
                this.busy.set(false);
                if (!result.isSuccess) {
                    this.showFailure(result.message, result.fieldErrors);
                    return;
                }
                this.messageService.add({ severity: 'success', summary: 'Presupuesto creado', detail: input.title });
                void this.router.navigate(['/quotes', result.data]);
            });
            return;
        }

        this.update(id, (this.quote() as Quote).version, input);
    }

    // «Guardar de todos modos»: tras un conflicto, vuelve a guardar lo que hay en pantalla con la versión NUEVA del servidor (sabiendo que pisa lo que otro escribió).
    keepMine(): void {
        const latest = this.latest();
        const id = this.quoteId();
        if (!latest || id === null || this.busy()) {
            return;
        }
        if (!canEditQuote(latest.status)) {
            this.applyQuote(latest);
            this.showFailure('El presupuesto ya no es un borrador: no se puede modificar.');
            return;
        }
        this.errorMessage.set(null);
        this.fieldErrors.set([]);
        this.busy.set(true);
        this.update(id, latest.version, this.buildInput());
    }

    // «Cargar la suya»: descarta lo que había en pantalla y carga lo que hay guardado ahora.
    loadTheirs(): void {
        const latest = this.latest();
        if (latest) {
            this.errorMessage.set(null);
            this.fieldErrors.set([]);
            this.applyQuote(latest);
        }
    }

    private update(id: string, version: string, input: QuoteInput): void {
        this.quoteService.update(id, version, input).subscribe((result) => {
            if (result.isSuccess) {
                this.messageService.add({ severity: 'success', summary: 'Presupuesto guardado', detail: input.title });
                this.reload(id);
                return;
            }
            this.busy.set(false);
            if (result.code === QUOTE_CHANGED_MEANWHILE_CODE) {
                // Alguien lo cambió mientras tanto: NO se pisa nada. Se trae lo que hay y se deja elegir; lo escrito sigue en pantalla.
                this.quoteService.get(id).subscribe((fresh) => {
                    this.latest.set(fresh.data ?? null);
                    this.showFailure(result.message);
                });
                return;
            }
            this.showFailure(result.message, result.fieldErrors);
        });
    }

    // ===== Acciones sobre el estado =====

    run(transition: QuoteTransition): void {
        const id = this.quoteId();
        if (id === null || this.busy()) {
            return;
        }
        const text = TRANSITION_TEXT[transition];
        this.confirmationService.confirm({
            header: text.header,
            message: `${escapeHtml(this.quote()?.title ?? '')}: ${text.confirm}`,
            icon: 'pi pi-exclamation-triangle',
            acceptLabel: text.accept,
            rejectLabel: 'Volver',
            acceptButtonStyleClass: transition === 'reject' ? 'p-button-danger' : undefined,
            rejectButtonStyleClass: 'p-button-secondary p-button-text',
            accept: () => this.apply(id, transition)
        });
    }

    // ===== El PDF =====

    // Descarga el PDF del presupuesto guardado (spec 025). La API lo genera con los datos del servidor: aquí no se manda nada más que el id. El botón se deshabilita mientras se genera.
    downloadPdf(): void {
        const id = this.quoteId();
        const quote = this.quote();
        if (id === null || !quote || !this.canDownloadPdf()) {
            return;
        }
        this.errorMessage.set(null);
        this.fieldErrors.set([]);
        this.downloadingPdf.set(true);

        this.quoteService.downloadPdf(id).subscribe((result) => {
            this.downloadingPdf.set(false);
            if (result.isSuccess && result.data) {
                // El nombre de la API (solo si tiene la forma esperada); si no, el mismo que ella daría, construido con el número.
                const fileName = result.data.fileName ?? `presupuesto-${formatQuoteNumber(quote.number)}.pdf`;
                this.fileDownload.save(result.data.blob, fileName);
                this.messageService.add({ severity: 'success', summary: 'PDF generado', detail: fileName });
                return;
            }
            if (result.code === QUOTE_COMPANY_PROFILE_INCOMPLETE_CODE) {
                // La empresa no tiene sus datos fiscales: se enseña el aviso con su enlace, no un error suelto.
                this.profileComplete.set(false);
                return;
            }
            this.showFailure(result.message);
        });
    }

    remove(): void {
        const id = this.quoteId();
        if (id === null || this.busy()) {
            return;
        }
        this.confirmationService.confirm({
            header: 'Eliminar presupuesto',
            message: `¿Eliminar "${escapeHtml(this.quote()?.title ?? '')}"? Solo se pueden eliminar borradores y no se puede deshacer.`,
            icon: 'pi pi-exclamation-triangle',
            acceptLabel: 'Eliminar',
            rejectLabel: 'Volver',
            acceptButtonStyleClass: 'p-button-danger',
            rejectButtonStyleClass: 'p-button-secondary p-button-text',
            accept: () => {
                this.busy.set(true);
                this.quoteService.delete(id).subscribe((result) => {
                    this.busy.set(false);
                    if (!result.isSuccess) {
                        this.showFailure(result.message);
                        return;
                    }
                    this.messageService.add({ severity: 'success', summary: 'Presupuesto eliminado' });
                    void this.router.navigate(['/quotes']);
                });
            }
        });
    }

    private apply(id: string, transition: QuoteTransition): void {
        this.busy.set(true);
        this.errorMessage.set(null);
        this.quoteService.transition(id, transition).subscribe((result) => {
            const text = TRANSITION_TEXT[transition];
            this.messageService.add({ severity: result.isSuccess ? 'success' : 'error', summary: result.isSuccess ? text.done : text.failed, detail: result.isSuccess ? this.quote()?.title : result.message });
            if (!result.isSuccess) {
                this.showFailure(result.message);
            }
            // Tras cada acción se vuelve a pedir el presupuesto en vez de suponer el estado nuevo: la pantalla enseña lo que la API ha guardado de verdad.
            this.reload(id);
        });
    }

    // ===== Internos =====

    private reload(id: string): void {
        this.quoteService.get(id).subscribe((fresh) => {
            this.busy.set(false);
            if (fresh.data) {
                this.applyQuote(fresh.data);
            } else {
                this.showFailure(fresh.message);
            }
        });
    }

    // Carga lo guardado en la pantalla y lo da por «sin cambios».
    private applyQuote(quote: Quote): void {
        this.quote.set(quote);
        this.latest.set(null);
        this.customerId.set(quote.customerId);
        this.jobId.set(quote.jobId);
        this.title.set(quote.title);
        this.notes.set(quote.notes ?? '');
        this.validUntil.set(quote.validUntil ?? '');
        this.lines.set(
            [...quote.items].sort((a, b) => a.position - b.position).map((item) => ({ key: this.nextKey++, description: item.description, quantity: item.quantity, priceEuros: centsToEuros(item.unitPriceCents), vatPercent: item.vatPercent }))
        );
        this.submitted.set(false);
        this.savedSnapshot.set(this.snapshot());
    }

    private showFailure(message: string, fieldErrors?: FieldError[]): void {
        this.errorMessage.set(message);
        this.fieldErrors.set(fieldErrors ?? []);
    }

    // Lo que se manda: sin ningún importe calculado. El precio pasa de euros a céntimos enteros.
    private buildInput(): QuoteInput {
        return {
            jobId: this.jobId(),
            title: this.title().trim(),
            notes: this.notes().trim() ? this.notes().trim() : null,
            validUntil: this.validUntil() ? this.validUntil() : null,
            items: this.lines().map((line) => ({
                description: line.description.trim(),
                quantity: line.quantity as number,
                unitPriceCents: eurosToCents(line.priceEuros as number),
                vatPercent: line.vatPercent
            }))
        };
    }

    // Una representación estable de lo editable, para comparar con lo último guardado.
    private snapshot(): string {
        return JSON.stringify({
            jobId: this.jobId(),
            title: this.title().trim(),
            notes: this.notes().trim(),
            validUntil: this.validUntil(),
            lines: this.lines().map((line) => [line.description.trim(), line.quantity, line.priceEuros, line.vatPercent])
        });
    }

    private quantityError(line: LineDraft): string | undefined {
        const quantity = line.quantity;
        if (quantity === null || !Number.isFinite(quantity) || quantity <= 0) {
            return 'La cantidad debe ser mayor que 0.';
        }
        if (quantity > QUOTE_LIMITS.quantityMax) {
            return `No puede pasar de ${QUOTE_LIMITS.quantityMax}.`;
        }
        if (Math.round(quantity * 1000) / 1000 !== quantity) {
            return `Como máximo ${QUOTE_LIMITS.quantityDecimals} decimales.`;
        }
        return undefined;
    }

    private priceError(line: LineDraft): string | undefined {
        const price = line.priceEuros;
        if (price === null || !Number.isFinite(price) || price < 0) {
            return 'El precio no puede ser negativo.';
        }
        if (eurosToCents(price) > QUOTE_LIMITS.unitPriceCentsMax) {
            return 'El precio es demasiado alto.';
        }
        return undefined;
    }

    private vatError(line: LineDraft): string | undefined {
        return (VAT_RATES as readonly number[]).includes(line.vatPercent) ? undefined : 'Tipo de IVA no válido.';
    }

    private validateLine(line: LineDraft): LineErrors {
        const errors: LineErrors = {};
        const description = line.description.trim();
        if (!description) {
            errors.description = 'Describe la línea.';
        } else if (description.length > QUOTE_LIMITS.descriptionMaxLength) {
            errors.description = `Máximo ${QUOTE_LIMITS.descriptionMaxLength} caracteres.`;
        }
        const quantity = this.quantityError(line);
        if (quantity) {
            errors.quantity = quantity;
        }
        const price = this.priceError(line);
        if (price) {
            errors.price = price;
        }
        const vat = this.vatError(line);
        if (vat) {
            errors.vat = vat;
        }
        return errors;
    }
}
