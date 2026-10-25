import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { MessageService } from 'primeng/api';
import { Observable } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TextareaModule } from 'primeng/textarea';
import { CUSTOMER_LIMITS, CUSTOMER_TYPE_LABELS, CustomerInput, CustomerType } from '../../../../shared/models/customer.model';
import { FieldError } from '../../../../shared/models/problem-details.model';
import { OperationResult } from '../../../../shared/models/result.model';
import { CustomerService } from '../../services/customer.service';

type FieldName = 'name' | 'email' | 'phone' | 'address' | 'notes';

// Alta (/customers/new) y edición (/customers/:id) en el mismo formulario.
@Component({
    selector: 'app-customer-form',
    standalone: true,
    imports: [ReactiveFormsModule, RouterModule, ButtonModule, InputTextModule, TextareaModule, SelectButtonModule, MessageModule],
    templateUrl: './customer-form.component.html'
})
export class CustomerFormComponent implements OnInit {
    private fb = inject(FormBuilder);
    private route = inject(ActivatedRoute);
    private router = inject(Router);
    private customerService = inject(CustomerService);
    private messageService = inject(MessageService);

    readonly limits = CUSTOMER_LIMITS;
    readonly typeOptions = (Object.keys(CUSTOMER_TYPE_LABELS) as CustomerType[]).map((value) => ({ label: CUSTOMER_TYPE_LABELS[value], value }));

    readonly customerId = signal<string | null>(null);
    readonly loading = signal(false);
    readonly saving = signal(false);
    readonly errorMessage = signal<string | null>(null);

    // Los validadores repiten las reglas de la API (CreateCustomerCommandValidator) para avisar
    // antes de enviar. Son comodidad: la validación que cuenta es la del servidor, y si rechaza
    // algo, su mensaje por campo se pinta en ese campo (applyFieldErrors).
    readonly form = this.fb.nonNullable.group({
        type: this.fb.nonNullable.control<CustomerType>('Person'),
        name: ['', [Validators.required, Validators.maxLength(CUSTOMER_LIMITS.nameMaxLength)]],
        email: ['', [Validators.email]],
        phone: ['', [Validators.pattern(CUSTOMER_LIMITS.phonePattern)]],
        address: ['', [Validators.maxLength(CUSTOMER_LIMITS.addressMaxLength)]],
        notes: ['', [Validators.maxLength(CUSTOMER_LIMITS.notesMaxLength)]]
    });

    ngOnInit(): void {
        const id = this.route.snapshot.paramMap.get('id');
        if (!id) {
            return;
        }

        this.customerId.set(id);
        this.form.controls.type.disable();
        this.loading.set(true);
        this.customerService.get(id).subscribe((result) => {
            this.loading.set(false);
            if (!result.isSuccess || !result.data) {
                this.errorMessage.set(result.message);
                this.form.disable();
                return;
            }
            const c = result.data;
            this.form.patchValue({ type: c.type, name: c.name, email: c.email ?? '', phone: c.phone ?? '', address: c.address ?? '', notes: c.notes ?? '' });
        });
    }

    save(): void {
        if (this.form.invalid || this.saving()) {
            this.form.markAllAsTouched();
            return;
        }
        this.saving.set(true);
        this.errorMessage.set(null);

        const input = this.toInput();
        const id = this.customerId();
        const request: Observable<OperationResult<unknown>> = id ? this.customerService.update(id, input) : this.customerService.create(this.form.controls.type.value, input);

        request.subscribe((result) => {
            this.saving.set(false);
            if (result.isSuccess) {
                this.messageService.add({ severity: 'success', summary: id ? 'Cliente actualizado' : 'Cliente creado', detail: input.name });
                this.router.navigate(['/customers']);
                return;
            }
            this.errorMessage.set(result.message);
            this.applyFieldErrors(result.fieldErrors);
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
        if (errors['email']) return 'El email no es válido.';
        if (errors['pattern']) return 'El teléfono no es válido.';
        return '';
    }

    // Campos vacíos como null, no "": así la API no guarda cadenas vacías como datos de contacto.
    private toInput(): CustomerInput {
        const v = this.form.getRawValue();
        const orNull = (s: string) => s.trim() || null;
        return { name: v.name.trim(), email: orNull(v.email), phone: orNull(v.phone), address: orNull(v.address), notes: orNull(v.notes) };
    }

    // La API nombra los campos como las propiedades C# ("Email"); el formulario, en minúscula.
    private applyFieldErrors(fieldErrors: FieldError[] | undefined): void {
        for (const error of fieldErrors ?? []) {
            const control = this.form.get(error.field.charAt(0).toLowerCase() + error.field.slice(1));
            control?.setErrors({ ...control.errors, api: error.message });
            control?.markAsTouched();
        }
    }
}
