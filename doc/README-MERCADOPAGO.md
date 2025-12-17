# Integración de Mercado Pago - Guía Completa y Segura

## 📋 Tabla de Contenidos

- [Descripción General](#descripción-general)
- [Flujo Completo de Pago](#flujo-completo-de-pago)
- [Configuración](#configuración)
- [Arquitectura](#arquitectura)
- [Endpoints de la API](#endpoints-de-la-api)
- [Manejo de Estados](#manejo-de-estados)
- [Seguridad](#seguridad)
- [Testing](#testing)
- [Casos de Uso](#casos-de-uso)
- [Troubleshooting](#troubleshooting)

---

## 🎯 Descripción General

Esta integración con Mercado Pago implementa un flujo completo y seguro de procesamiento de pagos siguiendo las mejores prácticas recomendadas por Mercado Pago, incluyendo:

- ✅ Creación de preferencias de pago
- ✅ Redirección segura al checkout
- ✅ Validación de webhooks con firma digital HMAC SHA256
- ✅ Manejo completo de todos los estados de pago
- ✅ Idempotencia en procesamiento de webhooks
- ✅ Transacciones de base de datos para consistencia
- ✅ Callbacks de success/failure/pending
- ✅ Sistema de reembolsos y cancelaciones
- ✅ Tracking completo de órdenes y pagos
- ✅ Logging detallado y manejo de errores

---

## 🔄 Flujo Completo de Pago

### 1. Creación de la Orden

1. El cliente selecciona productos en el frontend
2. Frontend envía `POST /payments/create-preference`
3. Backend crea `Order` con estado `PENDING` en la BD
4. Backend crea `OrderItems` asociados
5. Backend crea `Preference` en Mercado Pago
6. Backend actualiza `Order` con `preferenceId`
7. Backend devuelve `{preferenceId, initPoint, orderId}`
8. Frontend muestra botón de pago con `initPoint`

### 2. Proceso de Pago

**Pago Aprobado:**

1. Cliente hace clic en "Pagar" (redirige a `initPoint`)
2. Mercado Pago muestra formulario de pago
3. Cliente ingresa datos y confirma
4. Mercado Pago procesa el pago
5. **Webhook:** MP envía `POST /payments/webhook` con `status: approved`
6. Backend consulta detalles del pago a MP
7. Backend crea/actualiza `Payment` con estado `APPROVED`
8. Backend actualiza `Order` a estado `PAID` y registra `paidAt`
9. **Redirect:** MP redirige al cliente a `/payments/callback/success`
10. Backend verifica estado y redirige a frontend success page
11. Frontend muestra confirmación de pago

**Pago Rechazado:**

1. MP procesa pago y lo rechaza
2. **Webhook:** MP envía notificación con `status: rejected`
3. Backend actualiza `Payment` a `REJECTED`
4. Backend actualiza `Order` a `FAILED` con `failureReason`
5. **Redirect:** MP redirige a `/payments/callback/failure`
6. Frontend muestra error y opción de reintentar

**Pago Pendiente (ej: efectivo):**

1. Cliente selecciona pago en efectivo
2. MP genera cupón de pago
3. **Webhook:** MP envía `status: pending`
4. Backend actualiza `Order` a `PROCESSING`
5. **Redirect:** MP redirige a `/payments/callback/pending`
6. Frontend muestra instrucciones de pago
7. Cuando el cliente paga, MP envía nuevo webhook con `status: approved`
8. Backend actualiza a `PAID`

### 3. Actualizaciones Posteriores

- **Reembolsos:** MP envía webhook → Backend actualiza `Order` a `REFUNDED`
- **Contracargos:** MP envía webhook → Backend actualiza a `CHARGED_BACK`
- **Cambios de estado:** Todos los cambios son notificados vía webhook

---

## ⚙️ Configuración

### 1. Variables de Entorno

Crea un archivo `.env` basado en `ENV-TEMPLATE.txt`:

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=mercadopago_db

# Mercado Pago Configuration
MERCADOPAGO_ACCESS_TOKEN=TU_ACCESS_TOKEN_AQUI
MERCADOPAGO_PUBLIC_KEY=TU_PUBLIC_KEY_AQUI
MERCADOPAGO_WEBHOOK_SECRET=TU_WEBHOOK_SECRET_AQUI

# Application Configuration
PORT=3000
NODE_ENV=development

# Frontend URLs (for redirects after payment)
FRONTEND_URL=http://localhost:3000
FRONTEND_SUCCESS_URL=http://localhost:3000/payment/success
FRONTEND_FAILURE_URL=http://localhost:3000/payment/failure
FRONTEND_PENDING_URL=http://localhost:3000/payment/pending
```

### 2. Obtener Credenciales de Mercado Pago

1. Crea una cuenta en [Mercado Pago Developers](https://www.mercadopago.com/developers)
2. Ve a "Tus integraciones" > "Credenciales"
3. Copia tu **Access Token** (producción o prueba)
4. Copia tu **Public Key** (opcional, para frontend)

### 3. Iniciar PostgreSQL con Docker

```bash
docker-compose up -d
```

Esto iniciará PostgreSQL en el puerto 5432.

### 4. Instalar Dependencias

```bash
pnpm install
```

### 5. Iniciar la Aplicación

```bash
# Desarrollo
pnpm run start:dev

# Producción
pnpm run build
pnpm run start:prod
```

## 📡 Endpoints Disponibles

### 1. Crear Preferencia de Pago

**POST** `/api/payments/create-preference`

```json
{
  "items": [
    {
      "title": "Producto 1",
      "description": "Descripción del producto",
      "quantity": 2,
      "unitPrice": 100.5,
      "productId": "prod-123",
      "pictureUrl": "https://example.com/image.jpg"
    }
  ],
  "customerEmail": "cliente@example.com",
  "customerName": "Juan Pérez",
  "customerPhone": "+5491123456789",
  "notes": "Notas adicionales"
}
```

**Respuesta:**

```json
{
  "preferenceId": "123456789-abc-def-ghi",
  "initPoint": "https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=...",
  "orderId": "uuid-de-la-orden"
}
```

### 2. Webhook de Notificaciones

**POST** `/api/payments/webhook`

Mercado Pago enviará notificaciones automáticamente a este endpoint cuando cambie el estado de un pago.

### 3. Verificar Estado de Pago

**GET** `/api/payments/verify/:paymentId`

Obtiene y actualiza el estado de un pago específico desde Mercado Pago.

### 4. Obtener Orden

**GET** `/api/payments/order/:orderId`

Obtiene información completa de una orden, incluyendo items y pagos.

### 5. Obtener Pagos de una Orden

**GET** `/api/payments/order/:orderId/payments`

Obtiene todos los pagos asociados a una orden.

## 🔒 Estados de Pago

La integración maneja los siguientes estados:

| Estado Mercado Pago | Estado Interno | Estado Orden |
| ------------------- | -------------- | ------------ |
| `pending`           | PENDING        | PENDING      |
| `approved`          | APPROVED       | PAID         |
| `authorized`        | AUTHORIZED     | PAID         |
| `in_process`        | IN_PROCESS     | PROCESSING   |
| `in_mediation`      | IN_MEDIATION   | PROCESSING   |
| `rejected`          | REJECTED       | FAILED       |
| `cancelled`         | CANCELLED      | FAILED       |
| `refunded`          | REFUNDED       | REFUNDED     |
| `charged_back`      | CHARGED_BACK   | REFUNDED     |

## 🗄️ Estructura de Base de Datos

### Tabla: `orders`

- Almacena información de las órdenes
- Incluye estado, total, cliente, etc.

### Tabla: `order_items`

- Almacena los items de cada orden
- Relación con `orders`

### Tabla: `payments`

- Almacena información de los pagos
- Incluye estado, monto, método de pago, etc.
- Relación con `orders`

## 🔐 Seguridad

### Buenas Prácticas Implementadas:

1. **Variables de Entorno**: Todas las credenciales están en variables de entorno
2. **Validación de Datos**: Uso de `class-validator` para validar todas las entradas
3. **HTTPS**: Requerido en producción
4. **Logging**: Registro de todas las operaciones importantes
5. **Manejo de Errores**: Errores manejados de forma segura sin exponer información sensible
6. **Verificación de Webhooks**: Preparado para verificación de firma (cuando esté disponible)

## 🧪 Pruebas

### Tarjetas de Prueba

Para pruebas, usa estas tarjetas de prueba de Mercado Pago:

- **Aprobada**: `5031 7557 3453 0604` (CVV: 123)
- **Rechazada**: `5031 4332 1540 6351` (CVV: 123)
- **Pendiente**: `5031 4332 1540 6351` (CVV: 123)

### Flujo de Prueba

1. Crea una preferencia de pago usando el endpoint `/api/payments/create-preference`
2. Redirige al usuario a la URL `initPoint` recibida
3. Completa el pago con una tarjeta de prueba
4. Mercado Pago enviará una notificación al webhook
5. Verifica el estado usando `/api/payments/order/:orderId`

## 📝 Notas Importantes

1. **Webhook URL**: Asegúrate de que tu aplicación sea accesible públicamente para recibir webhooks. En desarrollo, puedes usar herramientas como [ngrok](https://ngrok.com/) para exponer tu servidor local.

2. **Sincronización**: La base de datos se sincroniza automáticamente en desarrollo. En producción, usa migraciones de TypeORM.

3. **Monitoreo**: Revisa los logs regularmente para detectar problemas con los pagos.

4. **Backup**: Realiza backups regulares de la base de datos PostgreSQL.

## 🐛 Troubleshooting

### Error: "MERCADOPAGO_ACCESS_TOKEN is required"

- Verifica que la variable de entorno esté configurada correctamente en el archivo `.env`

### Error de conexión a PostgreSQL

- Verifica que Docker esté corriendo: `docker ps`
- Verifica que el contenedor esté activo: `docker-compose ps`
- Revisa los logs: `docker-compose logs postgres`

### Webhook no recibe notificaciones

- Verifica que la URL del webhook sea accesible públicamente
- Verifica que la URL esté configurada correctamente en Mercado Pago
- Revisa los logs de la aplicación para ver si hay errores

## 📚 Recursos Adicionales

- [Documentación Oficial de Mercado Pago](https://www.mercadopago.com/developers/es/docs)
- [SDK de Mercado Pago para Node.js](https://github.com/mercadopago/sdk-nodejs)
- [Documentación de NestJS](https://docs.nestjs.com/)

