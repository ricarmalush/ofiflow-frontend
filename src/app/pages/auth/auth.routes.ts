import { Routes } from '@angular/router';
import { Access } from './access';
import { Login } from './login';
import { Error } from './error';
import { AcceptInvitation } from './accept-invitation';
import { ForgotPassword } from './forgot-password';
import { ResetPassword } from './reset-password';
import { Register } from './register';
import { CompleteRegistration } from './complete-registration';

export default [
    { path: 'access', component: Access },
    { path: 'error', component: Error },
    { path: 'login', component: Login },
    { path: 'accept-invitation', component: AcceptInvitation },
    // Spec 018: recuperar la contraseña. Las dos son públicas (quien la olvidó no tiene sesión). La ruta de restablecer es la del enlace del correo
    // ({Email:LinkBaseUrl}/auth/reset-password#token=...): si se cambia aquí hay que cambiarla en la API (EmailLinks).
    { path: 'forgot-password', component: ForgotPassword },
    { path: 'reset-password', component: ResetPassword },
    // Spec 021: crear una cuenta. Las dos son públicas (quien se registra no tiene sesión). La ruta de completar es la del enlace del correo
    // ({Email:LinkBaseUrl}/auth/complete-registration#token=...): si se cambia aquí hay que cambiarla en la API (EmailLinks.CompleteRegistration).
    { path: 'register', component: Register },
    { path: 'complete-registration', component: CompleteRegistration }
] as Routes;
