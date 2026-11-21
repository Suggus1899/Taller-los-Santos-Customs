/** Filtro de la galería por categoría (sin JavaScript se muestran todas las fotos). */
export function initGalleryFilters(): void {
  const group = document.querySelector<HTMLElement>('[data-gallery-filters]');
  const gallery = document.querySelector<HTMLElement>('[data-gallery]');
  if (!group || !gallery) return;

  const buttons = Array.from(group.querySelectorAll<HTMLButtonElement>('[data-filter]'));
  const items = Array.from(gallery.querySelectorAll<HTMLElement>('[data-category]'));

  group.addEventListener('click', (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>('[data-filter]');
    if (!button) return;
    const filter = button.dataset.filter ?? 'all';

    for (const b of buttons) b.setAttribute('aria-pressed', String(b === button));
    for (const item of items) item.hidden = filter !== 'all' && item.dataset.category !== filter;
  });
}
