import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { PaginatorModule, PaginatorState } from 'primeng/paginator';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToolbarModule } from 'primeng/toolbar';
import { CLOCK } from '../../../../core/services/clock';
import { CurrentSessionService } from '../../../../core/services/current-session';
import { Customer } from '../../../../shared/models/customer.model';
import { QUOTE_STATUS_LABELS, QuoteListItem, QuoteStatus, QuoteTagSeverity, canEditQuote, formatQuoteNumber, isQuoteExpired, quoteStatusSeverity } from '../../../../shared/models/quote.model';
import { formatEuros } from '../../../../shared/models/quote-totals';
import { CustomerService } from '../../../customers/services/customer.service';
import { QuoteService } from '../../services/quote.service';

// Una fila del listado: la de la API más lo que se calcula para pintarla (número con formato, importe en euros, «caducado»).
interface QuoteRow extends QuoteListItem {
    numberLabel: string;
    totalLabel: string;
    expired: boolean;
    editable: boolean;
}

// El listado de presupuestos (spec 023 R15, D12): paginado EN EL SERVIDOR (la API devuelve de 1 a 100 por página, del más reciente al más antiguo y sin las líneas) y filtrable por
// estado y por cliente. «Caducado» es informativo: la validez pasada no bloquea nada.
@Component({
    selector: 'app-quote-list',
    standalone: true,
    imports: [RouterModule, FormsModule, TableModule, ButtonModule, TagModule, ToolbarModule, MessageModule, SelectModule, PaginatorModule],
    templateUrl: './quote-list.component.html'
})
export class QuoteListComponent implements OnInit {
    private quoteService = inject(QuoteService);
    private customerService = inject(CustomerService);
    private session = inject(CurrentSessionService);
    private clock = inject(CLOCK);

    readonly pageSize = 10;

    private readonly items = signal<QuoteListItem[]>([]);
    readonly customers = signal<Customer[]>([]);
    readonly totalCount = signal(0);
    readonly first = signal(0);
    readonly loading = signal(false);
    readonly errorMessage = signal<string | null>(null);
    readonly statusFilter = signal<QuoteStatus | null>(null);
    readonly customerFilter = signal<string | null>(null);

    readonly canWrite = computed(() => this.session.can('Quotes.Write'));

    readonly statusOptions = (Object.keys(QUOTE_STATUS_LABELS) as QuoteStatus[]).map((value) => ({ label: QUOTE_STATUS_LABELS[value], value }));
    readonly customerOptions = computed(() => this.customers().map((customer) => ({ label: customer.name, value: customer.id })));

    readonly rows = computed<QuoteRow[]>(() => {
        const now = this.clock();
        const canWrite = this.canWrite();
        return this.items().map((quote) => ({
            ...quote,
            numberLabel: formatQuoteNumber(quote.number),
            totalLabel: formatEuros(quote.totalCents),
            expired: isQuoteExpired(quote.validUntil, quote.status, now),
            // Un borrador se edita (con Quotes.Write); el resto se abre en modo lectura.
            editable: canWrite && canEditQuote(quote.status)
        }));
    });

    ngOnInit(): void {
        // Sin Customers.Read no se puede ofrecer el filtro por cliente (la API daría 403): el listado sigue funcionando sin él.
        if (this.session.can('Customers.Read')) {
            this.customerService.list().subscribe((result) => this.customers.set(result.data ?? []));
        }
        this.load();
    }

    statusLabel(status: QuoteStatus): string {
        return QUOTE_STATUS_LABELS[status] ?? status;
    }

    statusSeverity(status: QuoteStatus): QuoteTagSeverity {
        return quoteStatusSeverity(status);
    }

    onPage(event: PaginatorState): void {
        this.first.set(event.first ?? 0);
        this.load();
    }

    // Cambiar un filtro vuelve a la primera página: la actual podría no existir con el filtro nuevo.
    setStatus(status: QuoteStatus | null): void {
        this.statusFilter.set(status);
        this.first.set(0);
        this.load();
    }

    setCustomer(customerId: string | null): void {
        this.customerFilter.set(customerId);
        this.first.set(0);
        this.load();
    }

    private load(): void {
        this.loading.set(true);
        this.quoteService.list({ status: this.statusFilter(), customerId: this.customerFilter(), page: Math.floor(this.first() / this.pageSize) + 1, pageSize: this.pageSize }).subscribe((result) => {
            this.loading.set(false);
            this.items.set(result.data?.items ?? []);
            this.totalCount.set(result.data?.totalCount ?? 0);
            this.errorMessage.set(result.isSuccess ? null : result.message);
        });
    }
}
