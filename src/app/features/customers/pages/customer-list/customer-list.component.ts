import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterModule } from '@angular/router';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { Table, TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToolbarModule } from 'primeng/toolbar';
import { CurrentSessionService } from '../../../../core/services/current-session';
import { escapeHtml } from '../../../../core/utils/escape-html.util';
import { CUSTOMER_TYPE_LABELS, Customer } from '../../../../shared/models/customer.model';
import { CustomerService } from '../../services/customer.service';

@Component({
    selector: 'app-customer-list',
    standalone: true,
    imports: [RouterModule, TableModule, ButtonModule, TagModule, ToolbarModule, MessageModule, IconFieldModule, InputIconModule, InputTextModule],
    templateUrl: './customer-list.component.html'
})
export class CustomerListComponent implements OnInit {
    private customerService = inject(CustomerService);
    private messageService = inject(MessageService);
    private confirmationService = inject(ConfirmationService);
    private session = inject(CurrentSessionService);

    readonly customers = signal<Customer[]>([]);
    readonly loading = signal(false);
    readonly errorMessage = signal<string | null>(null);

    // Qué botones pintar. Si el rol no puede, el botón no aparece; si aun así llegara la
    // petición, la API respondería 403.
    readonly canWrite = this.session.can('Customers.Write');
    readonly canDelete = this.session.can('Customers.Delete');

    ngOnInit(): void {
        this.fetch();
    }

    // La API devuelve todos los clientes de la empresa de una vez (sin paginar), así que la
    // búsqueda y la ordenación se hacen aquí, en el navegador.
    onSearch(table: Table, event: Event): void {
        table.filterGlobal((event.target as HTMLInputElement).value, 'contains');
    }

    typeLabel(customer: Customer): string {
        return CUSTOMER_TYPE_LABELS[customer.type] ?? customer.type;
    }

    confirmDelete(customer: Customer): void {
        this.confirmationService.confirm({
            header: 'Eliminar cliente',
            message: `¿Eliminar a "${escapeHtml(customer.name)}"? Se borra definitivamente y no se puede deshacer.`,
            icon: 'pi pi-exclamation-triangle',
            acceptLabel: 'Eliminar',
            rejectLabel: 'Cancelar',
            acceptButtonStyleClass: 'p-button-danger',
            rejectButtonStyleClass: 'p-button-secondary p-button-text',
            accept: () => this.delete(customer)
        });
    }

    private fetch(): void {
        this.loading.set(true);
        this.customerService.list().subscribe((result) => {
            this.loading.set(false);
            this.customers.set(result.data ?? []);
            this.errorMessage.set(result.isSuccess ? null : result.message);
        });
    }

    private delete(customer: Customer): void {
        this.customerService.delete(customer.id).subscribe((result) => {
            this.messageService.add({
                severity: result.isSuccess ? 'success' : 'error',
                summary: result.isSuccess ? 'Cliente eliminado' : 'No se pudo eliminar',
                detail: result.isSuccess ? customer.name : result.message
            });
            if (result.isSuccess) {
                this.customers.update((list) => list.filter((c) => c.id !== customer.id));
            }
        });
    }
}
