import type { ImageKey } from './images.js';

export interface ServicePlan {
  name: string;
  /** Precio en USD; `null` cuando el precio depende del diagnóstico. */
  price: number | null;
  /** Texto alternativo cuando el precio no es fijo ("Gratis", "Desde $60"...). */
  priceLabel?: string;
  unit?: string;
  features: readonly string[];
  highlighted?: boolean;
}

export interface InfoBlock {
  title: string;
  body?: string;
  items?: readonly string[];
}

export interface Faq {
  question: string;
  answer: string;
}

export interface Service {
  slug: string;
  name: string;
  icon: string;
  image?: ImageKey;
  /** Resumen de una línea para tarjetas y meta description. */
  summary: string;
  intro: string;
  plans: readonly ServicePlan[];
  info: readonly InfoBlock[];
  faqs: readonly Faq[];
}

export const services: readonly Service[] = [
  {
    slug: 'mantenimiento',
    name: 'Mantenimiento preventivo',
    icon: 'oil',
    image: 'maintenance',
    summary: 'Cambio de aceite, filtros y revisión general para alargar la vida de tu motor.',
    intro:
      'La clave para la longevidad de tu vehículo. Trabajamos con aceites sintéticos de última generación y filtros OEM.',
    plans: [
      {
        name: 'Básico',
        price: 49,
        unit: 'por servicio',
        features: [
          'Cambio de aceite semisintético',
          'Filtro de aceite',
          'Revisión de 10 puntos',
          'Lavado básico',
        ],
      },
      {
        name: 'Premium',
        price: 89,
        unit: 'por servicio',
        highlighted: true,
        features: [
          'Aceite 100 % sintético',
          'Filtro de alto flujo',
          'Revisión de 25 puntos',
          'Limpieza de inyectores',
          'Lavado y aspirado',
        ],
      },
      {
        name: 'Full Service',
        price: 149,
        unit: 'por servicio',
        features: [
          'Todo lo del plan Premium',
          'Cambio de bujías',
          'Filtros de aire y de cabina',
          'Rotación de neumáticos',
          'Escaneo computarizado',
        ],
      },
    ],
    info: [
      {
        title: '¿Por qué es vital el mantenimiento?',
        body: 'Un motor bien mantenido consume menos combustible, contamina menos y puede durar hasta un 50 % más.',
        items: [
          'Evita averías costosas en carretera',
          'Mejora el valor de reventa',
          'Mantiene la seguridad de tu familia',
        ],
      },
    ],
    faqs: [],
  },
  {
    slug: 'reparaciones',
    name: 'Reparaciones mecánicas',
    icon: 'wrench',
    image: 'repairs',
    summary: 'Motor, transmisión, suspensión y sistema eléctrico, con diagnóstico previo.',
    intro:
      'Desde la reconstrucción de motores hasta fallas eléctricas complejas. Te explicamos qué falla y por qué antes de tocar nada.',
    plans: [],
    info: [
      {
        title: 'Motor y transmisión',
        body: 'Reconstrucción, empaquetaduras, sincronización y diagnóstico de caja de cambios.',
      },
      {
        title: 'Frenos y suspensión',
        body: 'Rectificación de discos, ABS, amortiguadores y tren delantero.',
      },
      {
        title: 'Sistema eléctrico',
        body: 'Alternadores, motor de arranque, cableado e iluminación.',
      },
      {
        title: '¿Ruidos extraños o luces en el tablero?',
        body: 'El escaneo computarizado es gratis con cualquier reparación mayor.',
      },
    ],
    faqs: [],
  },
  {
    slug: 'diagnostico',
    name: 'Diagnóstico computarizado',
    icon: 'gauge',
    summary: 'Escáneres de nivel concesionario para encontrar la falla real en minutos.',
    intro:
      'El estándar OBD2 permite leer códigos de error y monitorear sensores en tiempo real. Usamos escáneres profesionales que acceden a los módulos específicos de cada fabricante.',
    plans: [
      {
        name: 'Motor',
        price: 25,
        features: [
          'Códigos de falla del motor',
          'Sensores de oxígeno',
          'Sensores MAF/MAP',
          'Sistema de inyección',
          'Catalizador',
        ],
      },
      {
        name: 'Diagnóstico completo',
        price: 45,
        highlighted: true,
        features: [
          'Todos los módulos',
          'ABS y airbags',
          'Transmisión',
          'Aire acondicionado',
          'Módulo de carrocería (BCM)',
          'Informe impreso',
        ],
      },
      {
        name: 'Eléctrico',
        price: 30,
        features: [
          'Batería y alternador',
          'Motor de arranque',
          'Luces y señales',
          'Fusibles y relés',
          'Cableado',
        ],
      },
    ],
    info: [
      {
        title: 'Qué incluye',
        items: [
          'Lectura de códigos de error (DTC)',
          'Datos en vivo de sensores',
          'Pruebas de actuadores',
          'Reprogramación de módulos',
          'Borrado de códigos tras la reparación',
        ],
      },
      {
        title: 'Nuestro equipo',
        items: [
          'Autel MaxiSys Elite: escáner multimarca',
          'Launch X431 PRO: vehículos asiáticos, europeos y americanos',
          'Osciloscopio automotriz para sensores y actuadores',
          'Analizador de batería, arranque y alternador',
        ],
      },
    ],
    faqs: [
      {
        question: 'P0300: fallo de encendido aleatorio',
        answer:
          'El motor no quema bien el combustible en uno o más cilindros. Suele deberse a bujías gastadas, bobinas defectuosas o inyectores.',
      },
      {
        question: 'P0171: mezcla pobre (banco 1)',
        answer:
          'Entra demasiado aire o poco combustible. Revisamos fugas de vacío, sensor MAF, filtro de combustible e inyectores.',
      },
      {
        question: 'P0420: eficiencia del catalizador baja',
        answer:
          'El convertidor catalítico no trabaja bien. Puede requerir reemplazo o revisar los sensores de oxígeno.',
      },
      {
        question: 'P0442: fuga pequeña en el sistema EVAP',
        answer:
          'Hay una pequeña fuga en el control de emisiones evaporativas. Muchas veces es la tapa del combustible.',
      },
    ],
  },
  {
    slug: 'aire-acondicionado',
    name: 'Aire acondicionado',
    icon: 'snowflake',
    summary: 'Recarga, detección de fugas y reparación del sistema de A/C.',
    intro:
      'Mantén tu vehículo fresco en el calor tropical con un servicio completo de aire acondicionado automotriz.',
    plans: [
      {
        name: 'Recarga de gas',
        price: 45,
        features: [
          'Evacuación del sistema',
          'Prueba de vacío',
          'Recarga con R134a / R1234yf',
          'Aceite PAG incluido',
          'Verificación de presiones',
        ],
      },
      {
        name: 'Servicio completo',
        price: 89,
        highlighted: true,
        features: [
          'Diagnóstico con manómetros',
          'Detección de fugas UV',
          'Recarga de gas',
          'Limpieza del evaporador',
          'Cambio de filtro de cabina',
          'Desinfección antibacterial',
        ],
      },
      {
        name: 'Reparación',
        price: null,
        priceLabel: 'Desde $120',
        features: [
          'Cambio de compresor',
          'Reemplazo de condensador',
          'Reparación de fugas',
          'Válvula de expansión',
          'Mangueras y conectores',
        ],
      },
    ],
    info: [
      {
        title: 'Señales de que tu A/C necesita servicio',
        items: [
          'Enfría poco o el aire sale tibio',
          'Olor a humedad al encenderlo',
          'Chirridos o clics al activarlo',
          'Agua en el piso del pasajero',
          'El compresor se enciende y apaga constantemente',
          'El consumo de combustible sube mucho con el A/C',
        ],
      },
    ],
    faqs: [
      {
        question: '¿Cada cuánto debo usar el A/C?',
        answer:
          'Enciéndelo al menos 10 minutos cada semana. Así los sellos se mantienen lubricados y se previenen fugas.',
      },
      {
        question: '¿Cada cuánto se cambia el filtro de cabina?',
        answer:
          'Cada 15.000–20.000 km. Un filtro sucio reduce el flujo de aire y puede causar malos olores.',
      },
      {
        question: '¿Necesito un servicio anual?',
        answer:
          'Sí: un servicio preventivo anual evita fallas mayores y es más barato que reparar.',
      },
    ],
  },
  {
    slug: 'frenos',
    name: 'Frenos',
    icon: 'disc',
    summary: 'Inspección, pastillas, discos y líquido de frenos con garantía.',
    intro:
      'El sistema de seguridad más importante de tu vehículo. A 100 km/h, unos frenos en mal estado pueden añadir hasta 15 metros a la distancia de frenado.',
    plans: [
      {
        name: 'Inspección',
        price: 0,
        priceLabel: 'Gratis',
        unit: 'con cualquier servicio',
        features: [
          'Medición de pastillas',
          'Inspección de discos',
          'Revisión del líquido',
          'Verificación de mangueras',
          'Informe detallado',
        ],
      },
      {
        name: 'Cambio de pastillas',
        price: null,
        priceLabel: 'Desde $60',
        unit: 'por eje',
        features: [
          'Pastillas de calidad OEM',
          'Limpieza de cálipers',
          'Lubricación de guías',
          'Ajuste del freno de mano',
          'Garantía de 1 año',
        ],
      },
      {
        name: 'Kit completo',
        price: null,
        priceLabel: 'Desde $180',
        unit: 'por eje',
        highlighted: true,
        features: [
          'Discos nuevos',
          'Pastillas premium',
          'Líquido de frenos DOT4',
          'Sangrado del sistema',
          'Garantía de 2 años',
        ],
      },
    ],
    info: [],
    faqs: [
      {
        question: 'Chirrido metálico al frenar',
        answer:
          'Normalmente indica pastillas totalmente gastadas: el metal roza el disco y lo daña rápido.',
      },
      {
        question: 'Pedal esponjoso o que baja mucho',
        answer:
          'Puede haber aire en el sistema, una fuga de líquido o un problema en el cilindro maestro.',
      },
      {
        question: 'Vibración al frenar',
        answer: 'Probablemente los discos están alabeados y necesitan rectificarse o reemplazarse.',
      },
    ],
  },
  {
    slug: 'neumaticos',
    name: 'Neumáticos y alineación',
    icon: 'tire',
    image: 'tires',
    summary: 'Alineación 3D, balanceo y venta de neumáticos de las mejores marcas.',
    intro:
      'El único punto de contacto entre tu auto y la carretera. Asegura el máximo agarre y estabilidad.',
    plans: [
      {
        name: 'Alineación 3D',
        price: 40,
        unit: 'sedán y hatchback',
        features: ['Alineación computarizada', 'Revisión del tren delantero', 'Informe de estado'],
      },
      {
        name: 'Balanceo + alineación',
        price: 60,
        highlighted: true,
        features: [
          'Alineación 3D',
          'Balanceo de 4 ruedas',
          'Rotación de neumáticos',
          'Calibración de presión',
        ],
      },
      {
        name: 'Camionetas / SUV',
        price: 80,
        features: ['Alineación reforzada', 'Balanceo dinámico', 'Revisión de suspensión 4x4'],
      },
    ],
    info: [
      {
        title: 'Venta de neumáticos',
        body: 'Trabajamos con Michelin, Pirelli, Bridgestone y Goodyear.',
        items: [
          'Montaje gratuito comprando 4 neumáticos',
          'Garantía de 5 años por defectos de fabricación',
          'Reparación de pinchazos de por vida',
        ],
      },
    ],
    faqs: [],
  },
];

export function findService(slug: string): Service | undefined {
  return services.find((service) => service.slug === slug);
}

export const serviceSlugs = services.map((service) => service.slug);
