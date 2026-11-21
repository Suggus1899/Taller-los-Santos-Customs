interface Availability {
  date: string;
  taken: string[];
}

/**
 * Al elegir fecha, consulta los turnos ocupados y deshabilita esas horas.
 * El servidor vuelve a validar el turno al enviar (y la BD lo impide con un
 * índice único), así que esto es solo una ayuda para el usuario.
 */
export function initAppointmentSlots(): void {
  const form = document.querySelector<HTMLFormElement>('[data-appointment-form]');
  const dateInput = form?.querySelector<HTMLInputElement>('input[name="date"]');
  const status = form?.querySelector<HTMLElement>('[data-slots-status]');
  if (!form || !dateInput || !status) return;

  const slots = Array.from(form.querySelectorAll<HTMLInputElement>('input[name="time"]'));
  let controller: AbortController | null = null;

  const setTaken = (taken: readonly string[]) => {
    for (const slot of slots) {
      slot.disabled = taken.includes(slot.value);
      if (slot.disabled) slot.checked = false;
    }
  };

  const refresh = async () => {
    controller?.abort();
    setTaken([]);
    if (!dateInput.value) return;

    controller = new AbortController();
    status.textContent = 'Consultando disponibilidad…';
    try {
      const response = await fetch(
        `/cita/disponibilidad?fecha=${encodeURIComponent(dateInput.value)}`,
        {
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        },
      );
      const data = (await response.json()) as Partial<Availability> & { error?: string };
      if (!response.ok) {
        status.textContent = data.error ?? 'No pudimos consultar la disponibilidad.';
        return;
      }
      const taken = data.taken ?? [];
      setTaken(taken);
      const free = slots.length - taken.filter((t) => slots.some((s) => s.value === t)).length;
      status.textContent =
        free > 0
          ? `${free} horarios disponibles ese día.`
          : 'No quedan horarios ese día; prueba otra fecha.';
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        status.textContent = 'No pudimos consultar la disponibilidad. Puedes enviar igualmente.';
      }
    }
  };

  dateInput.addEventListener('change', () => void refresh());
  if (dateInput.value) void refresh();
}
