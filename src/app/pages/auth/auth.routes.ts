import { Routes } from '@angular/router';
import { Access } from './access';
import { Login } from './login';
import { Error } from './error';
import { AcceptInvitation } from './accept-invitation';
import { ForgotPassword } from './forgot-password';
import { ResetPassword } from './reset-password';

export default [
    { path: 'access', component: Access },
    { path: 'error', component: Error },
    { path: 'login', component: Login },
    { path: 'accept-invitation', component: AcceptInvitation },
    // Spec 018: recuperar la contraseña. Las dos son públicas (quien la olvidó no tiene sesión). La ruta de restablecer es la del enlace del correo
    // ({Email:LinkBaseUrl}/auth/reset-password#token=...): si se cambia aquí hay que cambiarla en la API (EmailLinks).
    { path: 'forgot-password', component: ForgotPassword },
    { path: 'reset-password', component: ResetPassword }
] as Routes;
