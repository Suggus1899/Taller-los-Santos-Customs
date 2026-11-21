import type { Faq } from './services.js';

export const processSteps = [
  {
    title: 'Diagnóstico',
    description: 'Evaluación digital completa para identificar el problema real.',
  },
  { title: 'Presupuesto', description: 'Cotización detallada y transparente, sin costos ocultos.' },
  { title: 'Reparación', description: 'Técnicos con experiencia y repuestos originales.' },
  { title: 'Entrega', description: 'Tu vehículo listo, probado y con garantía.' },
] as const;

export const values = [
  {
    icon: 'shield',
    title: 'Calidad',
    description: 'Piezas certificadas y originales para garantizar durabilidad.',
  },
  {
    icon: 'gauge',
    title: 'Tecnología',
    description: 'Equipos de diagnóstico actuales y técnicos en formación continua.',
  },
  {
    icon: 'check',
    title: 'Honestidad',
    description: 'Te mostramos exactamente qué falla y por qué antes de repararlo.',
  },
] as const;

export const brands = ['Michelin', 'Mobil 1', 'Bosch', 'Pirelli', 'NGK', 'Castrol'] as const;

export const homeFaqs: readonly Faq[] = [
  {
    question: '¿Qué métodos de pago aceptan?',
    answer:
      'Tarjetas de crédito y débito, transferencias bancarias y efectivo. Para reparaciones mayores ofrecemos planes de financiamiento.',
  },
  {
    question: '¿Sus reparaciones tienen garantía?',
    answer:
      'Sí: 6 meses o 10.000 km, lo que ocurra primero, en mano de obra y en los repuestos que suministramos.',
  },
  {
    question: '¿Necesito cita previa?',
    answer:
      'Recomendamos agendar para atenderte de inmediato, pero también recibimos emergencias según disponibilidad.',
  },
];

export const timeline = [
  {
    year: 1998,
    title: 'El comienzo',
    description: 'Abrimos en un pequeño local con 2 bahías de trabajo.',
  },
  {
    year: 2005,
    title: 'Expansión',
    description: 'Nos mudamos a un local con 6 bahías y diagnóstico avanzado.',
  },
  { year: 2012, title: 'Certificación Bosch', description: 'Taller autorizado Bosch Car Service.' },
  { year: 2020, title: 'Digitalización', description: 'Citas en línea y diagnóstico remoto.' },
  { year: 2024, title: '10.000+ clientes', description: 'Alcanzamos 10.000 clientes atendidos.' },
] as const;

export const team = [
  { name: 'Frank Santos', role: 'Fundador y jefe de mecánicos' },
  { name: 'Michael Santos', role: 'Especialista en rendimiento' },
  { name: 'Elena Rivas', role: 'Gerente de servicio' },
  { name: 'Carlos Méndez', role: 'Técnico en electrónica' },
] as const;

export const certifications = [
  'Bosch Car Service',
  'ISO 9001:2015',
  'ASE Certified',
  'Michelin Partner',
] as const;

export const guarantees = [
  {
    icon: 'shield',
    title: '6 meses en mano de obra',
    description: 'Cualquier defecto del trabajo realizado se corrige sin costo.',
  },
  {
    icon: 'wrench',
    title: '12 meses en repuestos',
    description: 'Los repuestos originales que instalamos tienen garantía extendida.',
  },
  {
    icon: 'gauge',
    title: '10.000 km de cobertura',
    description: 'Lo que ocurra primero entre tiempo y kilometraje.',
  },
  {
    icon: 'check',
    title: 'Informe detallado',
    description: 'Recibes un reporte de lo realizado y de lo que cubre la garantía.',
  },
] as const;

export const guaranteeTerms = [
  'Aplica solo a trabajos realizados en nuestras instalaciones.',
  'Debes presentar el comprobante de servicio original.',
  'No cubre daños por accidentes, mal uso o modificaciones no autorizadas.',
  'Los repuestos deben ser los suministrados por nosotros.',
  'Aplica únicamente al vehículo y componentes indicados en la factura.',
] as const;
