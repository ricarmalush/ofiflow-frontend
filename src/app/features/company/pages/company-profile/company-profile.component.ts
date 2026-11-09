import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { CurrentSessionService } from '../../../../core/services/current-session';
import { COMPANY_LIMITS, CompanyProfile, CompanyProfileInput } from '../../../../shared/models/company-profile.model';
import { FieldError } from '../../../../shared/models/problem-details.model';
import { isValidSpanishPostalCode, isValidSpanishTaxId } from '../../../../shared/models/spanish-tax-id';
import { CompanyService } from '../../services/company.service';

type FieldName = 'legalName' | 'taxId' | 'addressLine' | 'postalCode' | 'city' | 'province' | 'phone' | 'email';

// Obligatorio recortando: Validators.required da por bueno un campo con solo espacios, y la API lo recorta antes de guardar (quedaría vacío).
const requiredTrimmed: ValidatorFn = (control: AbstractControl): ValidationErrors | null => (((control.value as string) ?? '').trim() ? null : { required: true });

// Un campo vacío lo dice «obligatorio» (Validators.required), no «no válido»: estas reglas solo miran la forma de lo que se ha escrito.
const taxIdValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
    const value = control.value as string;
    return !value?.trim() || isValidSpanishTaxId(value) ? null : { taxId: true };
};

const postalCodeValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
    const value = control.value as string;
    return !value?.trim() || isValidSpanishPostalCode(value) ? null : { postalCode: true };
};

// La API recorta los opcionales antes de validarlos (« 600 123 456 » es un teléfono válido) y un opcional en blanco es «ausente»: aquí también.
function onTrimmed(validator: ValidatorFn): ValidatorFn {
    return (control) => {
        const value = ((control.value as string) ?? '').trim();
        return value ? validator({ value } as AbstractControl) : null;
    };
}

// El perfil fiscal de la empresa (spec 024): quién emite los documentos. Se lee con Company.Read y SOLO se edita con Company.Manage; sin él, la misma pantalla en solo lectura.
// Los datos pueden ser personales (el NIF de un autónomo es su DNI): no se guardan en ningún sitio del navegador, solo viven en el formulario.
@Component({
    selector: 'app-company-profile',
    standalone: true,
    imports: [ReactiveFormsModule, ButtonModule, InputTextModule, MessageModule],
    templateUrl: './company-profile.component.html'
})
export class CompanyProfileComponent implements OnInit {
    private fb = inject(FormBuilder);
    private session = inject(CurrentSessionService);
    private companyService = inject(CompanyService);
    private messageService = inject(MessageService);

    readonly limits = COMPANY_LIMITS;

    readonly canManage = computed(() => this.session.can('Company.Manage'));
    readonly loading = signal(true);
    readonly saving = signal(false);
    readonly errorMessage = signal<string | null>(null);
    // Se sabe «completo» solo cuando la API ha respondido; antes de eso no se avisa de nada.
    readonly profile = signal<CompanyProfile | null>(null);
    readonly showIncompleteNotice = computed(() => this.profile() !== null && !this.profile()!.isComplete);

    // Los validadores repiten las reglas de la API (UpsertCompanyProfileCommandValidator) para avisar antes de enviar. Son comodidad: la validación que cuenta es la del servidor, y si
    // rechaza algo, su mensaje por campo se pinta en ese campo (applyFieldErrors).
    readonly form = this.fb.nonNullable.group({
        legalName: ['', [requiredTrimmed, Validators.maxLength(COMPANY_LIMITS.legalNameMaxLength)]],
        taxId: ['', [requiredTrimmed, Validators.maxLength(COMPANY_LIMITS.taxIdInputMaxLength), taxIdValidator]],
        addressLine: ['', [requiredTrimmed, Validators.maxLength(COMPANY_LIMITS.addressLineMaxLength)]],
        postalCode: ['', [requiredTrimmed, postalCodeValidator]],
        city: ['', [requiredTrimmed, Validators.maxLength(COMPANY_LIMITS.cityMaxLength)]],
        province: ['', [Validators.maxLength(COMPANY_LIMITS.provinceMaxLength)]],
        phone: ['', [Validators.maxLength(COMPANY_LIMITS.phoneMaxLength), onTrimmed(Validators.pattern(COMPANY_LIMITS.phonePattern))]],
        email: ['', [Validators.maxLength(COMPANY_LIMITS.emailMaxLength), onTrimmed(Validators.email)]]
    });

    ngOnInit(): void {
        // Sin Company.Manage no se puede editar: el formulario nace deshabilitado y no ofrece guardar. La API lo vuelve a comprobar (403).
        if (!this.canManage()) {
            this.form.disable();
        }
        this.load(false);
    }

    save(): void {
        if (!this.canManage() || this.saving()) {
            return;
        }
        if (this.form.invalid) {
            this.form.markAllAsTouched();
            return;
        }
        this.saving.set(true);
        this.errorMessage.set(null);

        this.companyService.save(this.toInput()).subscribe((result) => {
            if (!result.isSuccess) {
                this.saving.set(false);
                this.errorMessage.set(result.message);
                this.applyFieldErrors(result.fieldErrors);
                return;
            }
            this.messageService.add({ severity: 'success', summary: 'Datos de la empresa guardados' });
            // El PUT no devuelve nada: se vuelve a leer para ver el NIF tal como se ha guardado (normalizado) y confirmar que ya está completo.
            this.load(true);
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
        if (errors['taxId']) return 'El NIF, NIE o CIF no es válido: revisa la letra o el dígito de control.';
        if (errors['postalCode']) return 'Un código postal español: cinco cifras, de 01000 a 52999.';
        if (errors['pattern']) return 'El teléfono no es válido.';
        if (errors['email']) return 'El email no es válido.';
        return '';
    }

    private load(afterSave: boolean): void {
        this.companyService.get().subscribe((result) => {
            this.loading.set(false);
            this.saving.set(false);
            if (!result.isSuccess || !result.data) {
                // Tras guardar, que falle la relectura no deshace lo guardado: se avisa y el formulario se queda como estaba.
                this.errorMessage.set(result.message);
                if (!afterSave) this.form.disable();
                return;
            }
            const p = result.data;
            this.profile.set(p);
            this.form.reset({
                legalName: p.legalName ?? '',
                taxId: p.taxId ?? '',
                addressLine: p.addressLine ?? '',
                postalCode: p.postalCode ?? '',
                city: p.city ?? '',
                province: p.province ?? '',
                phone: p.phone ?? '',
                email: p.email ?? ''
            });
        });
    }

    // Los opcionales vacíos van como null, no "": la API borra el anterior si no llega, y no debe guardar cadenas vacías como datos de contacto.
    private toInput(): CompanyProfileInput {
        const v = this.form.getRawValue();
        const orNull = (s: string) => s.trim() || null;
        return {
            legalName: v.legalName.trim(),
            taxId: v.taxId.trim(),
            addressLine: v.addressLine.trim(),
            postalCode: v.postalCode.trim(),
            city: v.city.trim(),
            province: orNull(v.province),
            phone: orNull(v.phone),
            email: orNull(v.email)
        };
    }

    // La API nombra los campos como las propiedades C# ("TaxId"); el formulario, en minúscula.
    private applyFieldErrors(fieldErrors: FieldError[] | undefined): void {
        for (const error of fieldErrors ?? []) {
            const control = this.form.get(error.field.charAt(0).toLowerCase() + error.field.slice(1));
            control?.setErrors({ ...control.errors, api: error.message });
            control?.markAsTouched();
        }
    }
}
