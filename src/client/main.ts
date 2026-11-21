/**
 * Punto de entrada del navegador. Cada módulo es una mejora progresiva:
 * la página funciona sin JavaScript y estos scripts solo la enriquecen.
 */
import { initAppointmentSlots } from './appointment.js';
import { initGalleryFilters } from './gallery.js';
import { initNavigation } from './navigation.js';
import { initQuotePreview } from './quote.js';

initNavigation();
initGalleryFilters();
initQuotePreview();
initAppointmentSlots();
