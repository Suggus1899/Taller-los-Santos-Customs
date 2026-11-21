/** Menú móvil: alterna la visibilidad y mantiene aria-expanded sincronizado. */
export function initNavigation(): void {
  const toggle = document.querySelector<HTMLButtonElement>('[data-nav-toggle]');
  const menuId = toggle?.getAttribute('aria-controls');
  const menu = menuId ? document.getElementById(menuId) : null;
  if (!toggle || !menu) return;

  const label = toggle.querySelector('.sr-only');

  const setOpen = (open: boolean) => {
    toggle.setAttribute('aria-expanded', String(open));
    menu.classList.toggle('is-open', open);
    if (label) label.textContent = open ? 'Cerrar menú' : 'Abrir menú';
  };

  toggle.addEventListener('click', () => {
    setOpen(toggle.getAttribute('aria-expanded') !== 'true');
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && menu.classList.contains('is-open')) {
      setOpen(false);
      toggle.focus();
    }
  });
}
