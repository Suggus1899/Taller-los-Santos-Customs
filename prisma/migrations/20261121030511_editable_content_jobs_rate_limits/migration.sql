-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "reminder_sent_at" TIMESTAMPTZ(3),
ALTER COLUMN "service_slug" SET DATA TYPE VARCHAR(60);

-- CreateTable
CREATE TABLE "services" (
    "id" SERIAL NOT NULL,
    "slug" VARCHAR(60) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "icon" VARCHAR(30) NOT NULL,
    "image_key" VARCHAR(30),
    "summary" VARCHAR(200) NOT NULL,
    "intro" VARCHAR(1000) NOT NULL,
    "plans" JSONB NOT NULL DEFAULT '[]',
    "info" JSONB NOT NULL DEFAULT '[]',
    "faqs" JSONB NOT NULL DEFAULT '[]',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotions" (
    "id" SERIAL NOT NULL,
    "title" VARCHAR(80) NOT NULL,
    "description" VARCHAR(300) NOT NULL,
    "price" VARCHAR(20) NOT NULL,
    "previous_price" VARCHAR(20),
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "cta_label" VARCHAR(40) NOT NULL,
    "cta_href" VARCHAR(200) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "starts_at" TIMESTAMPTZ(3),
    "ends_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "promotions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" BIGSERIAL NOT NULL,
    "type" VARCHAR(64) NOT NULL,
    "payload" JSONB NOT NULL,
    "run_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "locked_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "failed_at" TIMESTAMPTZ(3),
    "last_error" TEXT,
    "dedupe_key" VARCHAR(120),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limits" (
    "key" VARCHAR(200) NOT NULL,
    "hits" INTEGER NOT NULL,
    "reset_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "rate_limits_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "services_slug_key" ON "services"("slug");

-- CreateIndex
CREATE INDEX "services_is_active_sort_order_idx" ON "services"("is_active", "sort_order");

-- CreateIndex
CREATE INDEX "promotions_is_active_sort_order_idx" ON "promotions"("is_active", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "jobs_dedupe_key_key" ON "jobs"("dedupe_key");

-- CreateIndex
CREATE INDEX "jobs_type_created_at_idx" ON "jobs"("type", "created_at");

-- CreateIndex
CREATE INDEX "rate_limits_reset_at_idx" ON "rate_limits"("reset_at");

-- ───────────── Datos iniciales del catálogo (antes contenido en código) ─────────────
INSERT INTO "services" ("slug","name","icon","image_key","summary","intro","plans","info","faqs","sort_order","updated_at") VALUES ('mantenimiento', 'Mantenimiento preventivo', 'oil', 'maintenance', 'Cambio de aceite, filtros y revisión general para alargar la vida de tu motor.', 'La clave para la longevidad de tu vehículo. Trabajamos con aceites sintéticos de última generación y filtros OEM.', $json$[{"name":"Básico","price":49,"unit":"por servicio","features":["Cambio de aceite semisintético","Filtro de aceite","Revisión de 10 puntos","Lavado básico"]},{"name":"Premium","price":89,"unit":"por servicio","highlighted":true,"features":["Aceite 100 % sintético","Filtro de alto flujo","Revisión de 25 puntos","Limpieza de inyectores","Lavado y aspirado"]},{"name":"Full Service","price":149,"unit":"por servicio","features":["Todo lo del plan Premium","Cambio de bujías","Filtros de aire y de cabina","Rotación de neumáticos","Escaneo computarizado"]}]$json$::jsonb, $json$[{"title":"¿Por qué es vital el mantenimiento?","body":"Un motor bien mantenido consume menos combustible, contamina menos y puede durar hasta un 50 % más.","items":["Evita averías costosas en carretera","Mejora el valor de reventa","Mantiene la seguridad de tu familia"]}]$json$::jsonb, $json$[]$json$::jsonb, 10, CURRENT_TIMESTAMP);
INSERT INTO "services" ("slug","name","icon","image_key","summary","intro","plans","info","faqs","sort_order","updated_at") VALUES ('reparaciones', 'Reparaciones mecánicas', 'wrench', 'repairs', 'Motor, transmisión, suspensión y sistema eléctrico, con diagnóstico previo.', 'Desde la reconstrucción de motores hasta fallas eléctricas complejas. Te explicamos qué falla y por qué antes de tocar nada.', $json$[]$json$::jsonb, $json$[{"title":"Motor y transmisión","body":"Reconstrucción, empaquetaduras, sincronización y diagnóstico de caja de cambios."},{"title":"Frenos y suspensión","body":"Rectificación de discos, ABS, amortiguadores y tren delantero."},{"title":"Sistema eléctrico","body":"Alternadores, motor de arranque, cableado e iluminación."},{"title":"¿Ruidos extraños o luces en el tablero?","body":"El escaneo computarizado es gratis con cualquier reparación mayor."}]$json$::jsonb, $json$[]$json$::jsonb, 20, CURRENT_TIMESTAMP);
INSERT INTO "services" ("slug","name","icon","image_key","summary","intro","plans","info","faqs","sort_order","updated_at") VALUES ('diagnostico', 'Diagnóstico computarizado', 'gauge', NULL, 'Escáneres de nivel concesionario para encontrar la falla real en minutos.', 'El estándar OBD2 permite leer códigos de error y monitorear sensores en tiempo real. Usamos escáneres profesionales que acceden a los módulos específicos de cada fabricante.', $json$[{"name":"Motor","price":25,"features":["Códigos de falla del motor","Sensores de oxígeno","Sensores MAF/MAP","Sistema de inyección","Catalizador"]},{"name":"Diagnóstico completo","price":45,"highlighted":true,"features":["Todos los módulos","ABS y airbags","Transmisión","Aire acondicionado","Módulo de carrocería (BCM)","Informe impreso"]},{"name":"Eléctrico","price":30,"features":["Batería y alternador","Motor de arranque","Luces y señales","Fusibles y relés","Cableado"]}]$json$::jsonb, $json$[{"title":"Qué incluye","items":["Lectura de códigos de error (DTC)","Datos en vivo de sensores","Pruebas de actuadores","Reprogramación de módulos","Borrado de códigos tras la reparación"]},{"title":"Nuestro equipo","items":["Autel MaxiSys Elite: escáner multimarca","Launch X431 PRO: vehículos asiáticos, europeos y americanos","Osciloscopio automotriz para sensores y actuadores","Analizador de batería, arranque y alternador"]}]$json$::jsonb, $json$[{"question":"P0300: fallo de encendido aleatorio","answer":"El motor no quema bien el combustible en uno o más cilindros. Suele deberse a bujías gastadas, bobinas defectuosas o inyectores."},{"question":"P0171: mezcla pobre (banco 1)","answer":"Entra demasiado aire o poco combustible. Revisamos fugas de vacío, sensor MAF, filtro de combustible e inyectores."},{"question":"P0420: eficiencia del catalizador baja","answer":"El convertidor catalítico no trabaja bien. Puede requerir reemplazo o revisar los sensores de oxígeno."},{"question":"P0442: fuga pequeña en el sistema EVAP","answer":"Hay una pequeña fuga en el control de emisiones evaporativas. Muchas veces es la tapa del combustible."}]$json$::jsonb, 30, CURRENT_TIMESTAMP);
INSERT INTO "services" ("slug","name","icon","image_key","summary","intro","plans","info","faqs","sort_order","updated_at") VALUES ('aire-acondicionado', 'Aire acondicionado', 'snowflake', NULL, 'Recarga, detección de fugas y reparación del sistema de A/C.', 'Mantén tu vehículo fresco en el calor tropical con un servicio completo de aire acondicionado automotriz.', $json$[{"name":"Recarga de gas","price":45,"features":["Evacuación del sistema","Prueba de vacío","Recarga con R134a / R1234yf","Aceite PAG incluido","Verificación de presiones"]},{"name":"Servicio completo","price":89,"highlighted":true,"features":["Diagnóstico con manómetros","Detección de fugas UV","Recarga de gas","Limpieza del evaporador","Cambio de filtro de cabina","Desinfección antibacterial"]},{"name":"Reparación","price":null,"priceLabel":"Desde $120","features":["Cambio de compresor","Reemplazo de condensador","Reparación de fugas","Válvula de expansión","Mangueras y conectores"]}]$json$::jsonb, $json$[{"title":"Señales de que tu A/C necesita servicio","items":["Enfría poco o el aire sale tibio","Olor a humedad al encenderlo","Chirridos o clics al activarlo","Agua en el piso del pasajero","El compresor se enciende y apaga constantemente","El consumo de combustible sube mucho con el A/C"]}]$json$::jsonb, $json$[{"question":"¿Cada cuánto debo usar el A/C?","answer":"Enciéndelo al menos 10 minutos cada semana. Así los sellos se mantienen lubricados y se previenen fugas."},{"question":"¿Cada cuánto se cambia el filtro de cabina?","answer":"Cada 15.000–20.000 km. Un filtro sucio reduce el flujo de aire y puede causar malos olores."},{"question":"¿Necesito un servicio anual?","answer":"Sí: un servicio preventivo anual evita fallas mayores y es más barato que reparar."}]$json$::jsonb, 40, CURRENT_TIMESTAMP);
INSERT INTO "services" ("slug","name","icon","image_key","summary","intro","plans","info","faqs","sort_order","updated_at") VALUES ('frenos', 'Frenos', 'disc', NULL, 'Inspección, pastillas, discos y líquido de frenos con garantía.', 'El sistema de seguridad más importante de tu vehículo. A 100 km/h, unos frenos en mal estado pueden añadir hasta 15 metros a la distancia de frenado.', $json$[{"name":"Inspección","price":0,"priceLabel":"Gratis","unit":"con cualquier servicio","features":["Medición de pastillas","Inspección de discos","Revisión del líquido","Verificación de mangueras","Informe detallado"]},{"name":"Cambio de pastillas","price":null,"priceLabel":"Desde $60","unit":"por eje","features":["Pastillas de calidad OEM","Limpieza de cálipers","Lubricación de guías","Ajuste del freno de mano","Garantía de 1 año"]},{"name":"Kit completo","price":null,"priceLabel":"Desde $180","unit":"por eje","highlighted":true,"features":["Discos nuevos","Pastillas premium","Líquido de frenos DOT4","Sangrado del sistema","Garantía de 2 años"]}]$json$::jsonb, $json$[]$json$::jsonb, $json$[{"question":"Chirrido metálico al frenar","answer":"Normalmente indica pastillas totalmente gastadas: el metal roza el disco y lo daña rápido."},{"question":"Pedal esponjoso o que baja mucho","answer":"Puede haber aire en el sistema, una fuga de líquido o un problema en el cilindro maestro."},{"question":"Vibración al frenar","answer":"Probablemente los discos están alabeados y necesitan rectificarse o reemplazarse."}]$json$::jsonb, 50, CURRENT_TIMESTAMP);
INSERT INTO "services" ("slug","name","icon","image_key","summary","intro","plans","info","faqs","sort_order","updated_at") VALUES ('neumaticos', 'Neumáticos y alineación', 'tire', 'tires', 'Alineación 3D, balanceo y venta de neumáticos de las mejores marcas.', 'El único punto de contacto entre tu auto y la carretera. Asegura el máximo agarre y estabilidad.', $json$[{"name":"Alineación 3D","price":40,"unit":"sedán y hatchback","features":["Alineación computarizada","Revisión del tren delantero","Informe de estado"]},{"name":"Balanceo + alineación","price":60,"highlighted":true,"features":["Alineación 3D","Balanceo de 4 ruedas","Rotación de neumáticos","Calibración de presión"]},{"name":"Camionetas / SUV","price":80,"features":["Alineación reforzada","Balanceo dinámico","Revisión de suspensión 4x4"]}]$json$::jsonb, $json$[{"title":"Venta de neumáticos","body":"Trabajamos con Michelin, Pirelli, Bridgestone y Goodyear.","items":["Montaje gratuito comprando 4 neumáticos","Garantía de 5 años por defectos de fabricación","Reparación de pinchazos de por vida"]}]$json$::jsonb, $json$[]$json$::jsonb, 60, CURRENT_TIMESTAMP);
INSERT INTO "promotions" ("title","description","price","previous_price","featured","cta_label","cta_href","sort_order","updated_at") VALUES ('Mantenimiento Premium', 'Cambio de aceite sintético, filtros y revisión de 25 puntos.', '$69', '$89', true, 'Agendar cita', '/cita?servicio=mantenimiento', 10, CURRENT_TIMESTAMP);
INSERT INTO "promotions" ("title","description","price","previous_price","featured","cta_label","cta_href","sort_order","updated_at") VALUES ('2x1 en alineación', 'Trae a un amigo y ambos pagan una sola alineación.', '$40', NULL, false, 'Agendar cita', '/cita?servicio=neumaticos', 20, CURRENT_TIMESTAMP);
INSERT INTO "promotions" ("title","description","price","previous_price","featured","cta_label","cta_href","sort_order","updated_at") VALUES ('Escaneo gratis', 'Diagnóstico computarizado sin costo con cualquier reparación mayor.', '$0', NULL, false, 'Ver diagnóstico', '/servicios/diagnostico', 30, CURRENT_TIMESTAMP);
INSERT INTO "promotions" ("title","description","price","previous_price","featured","cta_label","cta_href","sort_order","updated_at") VALUES ('10 % en tu primer servicio', 'Descuento para clientes nuevos en su primera visita.', '-10 %', NULL, false, 'Solicitar cotización', '/cotizar', 40, CURRENT_TIMESTAMP);


-- ───────────── Restricciones e índices que Prisma no expresa ─────────────

-- Cola: índice parcial solo sobre trabajos pendientes (el worker lo consulta cada pocos segundos).
CREATE INDEX "idx_jobs_pending" ON "jobs" ("run_at") WHERE "completed_at" IS NULL AND "failed_at" IS NULL;
ALTER TABLE "jobs"
  ADD CONSTRAINT "ck_jobs_attempts" CHECK ("attempts" >= 0 AND "max_attempts" >= 1);

-- Rate limit: contadores efímeros; no necesitan WAL ni sobrevivir a una caída del servidor.
ALTER TABLE "rate_limits" SET UNLOGGED;

ALTER TABLE "services"
  ADD CONSTRAINT "ck_services_slug" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  ADD CONSTRAINT "ck_services_json_arrays" CHECK (
    jsonb_typeof("plans") = 'array' AND jsonb_typeof("info") = 'array' AND jsonb_typeof("faqs") = 'array');

ALTER TABLE "promotions"
  ADD CONSTRAINT "ck_promotions_window" CHECK ("starts_at" IS NULL OR "ends_at" IS NULL OR "starts_at" < "ends_at");

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_service_slug_fkey" FOREIGN KEY ("service_slug") REFERENCES "services"("slug") ON DELETE RESTRICT ON UPDATE CASCADE;
