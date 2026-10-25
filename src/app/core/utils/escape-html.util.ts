// Para meter datos del usuario en un texto que una librería pinta con [innerHTML] (p. ej. el
// mensaje de p-confirmdialog). Angular ya sanea [innerHTML] y quita scripts y manejadores, pero
// el HTML que considera seguro sí se pinta: un cliente llamado "<b>X</b>" saldría en negrita y
// uno con <img src="https://..."> haría una petición a otro dominio. Escapado, se ve tal cual.
export function escapeHtml(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
