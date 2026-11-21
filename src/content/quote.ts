/**
 * Tarifas del cotizador en línea. El total se calcula SIEMPRE en el servidor
 * a partir de estas tablas; el navegador solo muestra una vista previa.
 */
export interface QuoteOption {
  id: string;
  label: string;
  description: string;
  /** USD. En vehículos es un recargo sobre el servicio. */
  price: number;
}

export const vehicleTypes = [
  { id: 'sedan', label: 'Sedán / hatchback', description: 'Vehículo compacto o mediano', price: 0 },
  { id: 'suv', label: 'SUV / crossover', description: 'Recargo por tamaño', price: 20 },
  { id: 'pickup', label: 'Pickup', description: 'Camioneta de carga', price: 30 },
  { id: 'sport', label: 'Deportivo', description: 'Alto rendimiento', price: 50 },
] as const satisfies readonly QuoteOption[];

export const quoteServices = [
  { id: 'oil', label: 'Cambio de aceite', description: 'Aceite y filtro', price: 50 },
  { id: 'brakes', label: 'Frenos', description: 'Pastillas por eje', price: 80 },
  { id: 'alignment', label: 'Alineación', description: 'Alineación 3D', price: 40 },
  { id: 'diagnosis', label: 'Diagnóstico', description: 'Escaneo computarizado', price: 30 },
  { id: 'full', label: 'Servicio completo', description: 'Mantenimiento integral', price: 150 },
] as const satisfies readonly QuoteOption[];

export const quoteExtras = [
  { id: 'none', label: 'Sin extras', description: 'Solo el servicio', price: 0 },
  { id: 'wash', label: 'Lavado', description: 'Exterior e interior', price: 15 },
  { id: 'ac', label: 'Revisión de A/C', description: 'Presiones y filtro', price: 25 },
  { id: 'polish', label: 'Pulido', description: 'Pulido de carrocería', price: 30 },
] as const satisfies readonly QuoteOption[];

export type VehicleTypeId = (typeof vehicleTypes)[number]['id'];
export type QuoteServiceId = (typeof quoteServices)[number]['id'];
export type QuoteExtraId = (typeof quoteExtras)[number]['id'];

export const vehicleTypeIds = vehicleTypes.map((o) => o.id) as [VehicleTypeId, ...VehicleTypeId[]];
export const quoteServiceIds = quoteServices.map((o) => o.id) as [
  QuoteServiceId,
  ...QuoteServiceId[],
];
export const quoteExtraIds = quoteExtras.map((o) => o.id) as [QuoteExtraId, ...QuoteExtraId[]];

function priceOf(options: readonly QuoteOption[], id: string): number {
  const option = options.find((o) => o.id === id);
  if (!option) throw new Error(`Opción de cotización desconocida: ${id}`);
  return option.price;
}

export function labelOf(options: readonly QuoteOption[], id: string): string {
  return options.find((o) => o.id === id)?.label ?? id;
}

export function calculateEstimate(input: {
  vehicleType: VehicleTypeId;
  service: QuoteServiceId;
  extra: QuoteExtraId;
}): number {
  return (
    priceOf(vehicleTypes, input.vehicleType) +
    priceOf(quoteServices, input.service) +
    priceOf(quoteExtras, input.extra)
  );
}
