/**
 * Vista previa del total en el cotizador. Es solo informativa: el precio
 * definitivo lo calcula el servidor con sus propias tarifas.
 */
export function initQuotePreview(): void {
  const form = document.querySelector<HTMLFormElement>('[data-quote-form]');
  const output = form?.querySelector<HTMLElement>('[data-quote-total]');
  if (!form || !output) return;

  const groups = ['vehicleType', 'service', 'extra'] as const;

  const update = () => {
    const selected = groups.map((name) =>
      form.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`),
    );
    // Sin servicio elegido no hay precio que mostrar.
    if (!selected[1]) {
      output.textContent = 'Elige un servicio';
      return;
    }
    const total = selected.reduce((sum, input) => sum + Number(input?.dataset.price ?? 0), 0);
    output.textContent = `$${total.toLocaleString('es-VE')}`;
  };

  form.addEventListener('change', update);
  update();
}
