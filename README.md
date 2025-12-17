# 🚀 Template NestJS + Mercado Pago Checkout Pro

Un template completo y listo para producción de integración con **Mercado Pago Checkout Pro** usando **NestJS**, **TypeORM** y **PostgreSQL**. Este proyecto implementa todas las mejores prácticas recomendadas por Mercado Pago y está validado contra su checklist de calidad.

## ✨ Características

- ✅ **Checkout Pro completo** - Integración completa con Mercado Pago
- ✅ **100% Checklist de Calidad** - Cumple con todos los requisitos del checklist de Mercado Pago
- ✅ **Validación de Webhooks** - Firma HMAC SHA256 para seguridad
- ✅ **Idempotencia** - Manejo seguro de webhooks duplicados
- ✅ **Transacciones de BD** - Consistencia de datos garantizada
- ✅ **Manejo completo de estados** - Todos los estados de pago implementados
- ✅ **Reembolsos y cancelaciones** - Sistema completo de gestión
- ✅ **TypeScript** - Tipado completo y seguro
- ✅ **Validación de datos** - DTOs con `class-validator`
- ✅ **Docker Compose** - PostgreSQL listo para usar
- ✅ **Documentación completa** - Guías detalladas en `/doc`

## 📋 Requisitos Previos

- **Node.js** 18+ 
- **pnpm** (o npm/yarn)
- **Docker** y **Docker Compose** (para PostgreSQL)
- **Cuenta de Mercado Pago** con credenciales de acceso

## 🚀 Inicio Rápido

### 1. Clonar o usar como template

```bash
# Si clonas el repositorio
git clone <tu-repositorio>
cd first-proyect

# O usa este proyecto como template en GitHub
```

### 2. Instalar dependencias

```bash
pnpm install
```

### 3. Configurar variables de entorno

Copia el archivo de plantilla y configura tus credenciales:

```bash
cp ENV-TEMPLATE.txt .env
```

Edita el archivo `.env` con tus credenciales de Mercado Pago:

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

# Frontend URLs
FRONTEND_URL=http://localhost:3001
BACKEND_URL=http://localhost:3000
```

### 4. Iniciar PostgreSQL con Docker

```bash
docker-compose up -d
```

### 5. Iniciar la aplicación

```bash
# Modo desarrollo
pnpm run start:dev

# Modo producción
pnpm run build
pnpm run start:prod
```

La aplicación estará disponible en `http://localhost:3000`

## 📖 Documentación

### Documentación Principal

- **[Guía Completa de Mercado Pago](./doc/README-MERCADOPAGO.md)** - Flujo completo, configuración, endpoints y casos de uso
- **[Análisis de Implementación](./doc/ANALISIS-IMPLEMENTACION-CHECKOUT-PRO.md)** - Análisis detallado comparado con checklist de calidad
- **[Mejoras Implementadas](./doc/MEJORAS-IMPLEMENTADAS.md)** - Lista de mejoras y optimizaciones aplicadas

### Obtener Credenciales de Mercado Pago

1. Crea una cuenta en [Mercado Pago Developers](https://www.mercadopago.com/developers)
2. Ve a "Tus integraciones" > "Credenciales"
3. Copia tu **Access Token** (producción o prueba)
4. Configura el **Webhook Secret** en tu aplicación de Mercado Pago

## 🎯 Uso Básico

### Crear una Preferencia de Pago

```bash
POST /api/payments/create-preference
Content-Type: application/json

{
  "items": [
    {
      "title": "Producto 1",
      "description": "Descripción del producto",
      "quantity": 2,
      "unitPrice": 100.5,
      "productId": "prod-123",
      "categoryId": "electronics",
      "pictureUrl": "https://example.com/image.jpg"
    }
  ],
  "customerEmail": "cliente@example.com",
  "customerFirstName": "Juan",
  "customerLastName": "Pérez",
  "customerPhone": "+54 11 1234-5678",
  "customerIdentificationType": "DNI",
  "customerIdentificationNumber": "12345678",
  "customerAddress": {
    "streetName": "Av. Corrientes",
    "streetNumber": "1234",
    "zipCode": "C1043AAX"
  },
  "shipmentAmount": 500,
  "maxInstallments": 6
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

### Redirigir al Checkout

Una vez que recibas el `initPoint`, redirige al usuario:

```javascript
// Frontend
window.location.href = response.initPoint;
```

### Endpoints Disponibles

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `POST` | `/api/payments/create-preference` | Crear preferencia de pago |
| `POST` | `/api/payments/webhook` | Recibir notificaciones de Mercado Pago |
| `GET` | `/api/payments/order/:orderId/status` | Obtener estado de una orden |
| `GET` | `/api/payments/callback/success` | Callback de pago exitoso |
| `GET` | `/api/payments/callback/failure` | Callback de pago fallido |
| `GET` | `/api/payments/callback/pending` | Callback de pago pendiente |

Ver [documentación completa](./doc/README-MERCADOPAGO.md) para más detalles.

## 🏗️ Estructura del Proyecto

```
first-proyect/
├── src/
│   ├── payments/              # Módulo de pagos
│   │   ├── dto/              # Data Transfer Objects
│   │   ├── entities/         # Entidades de TypeORM
│   │   ├── interfaces/       # Interfaces TypeScript
│   │   ├── mercadopago.service.ts    # Lógica de negocio
│   │   ├── payments.controller.ts   # Controlador REST
│   │   ├── payments.module.ts       # Módulo de NestJS
│   │   └── webhook-validator.service.ts  # Validación de webhooks
│   ├── config/               # Configuración
│   ├── database/             # Configuración de BD
│   └── main.ts               # Punto de entrada
├── doc/                      # Documentación
│   ├── README-MERCADOPAGO.md
│   ├── ANALISIS-IMPLEMENTACION-CHECKOUT-PRO.md
│   └── MEJORAS-IMPLEMENTADAS.md
├── docker-compose.yml        # Configuración de PostgreSQL
├── ENV-TEMPLATE.txt          # Plantilla de variables de entorno
└── README.md                 # Este archivo
```

## 🔒 Seguridad

### Características de Seguridad Implementadas

- ✅ **Validación de firma webhook** - HMAC SHA256
- ✅ **Variables de entorno** - Credenciales seguras
- ✅ **Validación de datos** - DTOs con `class-validator`
- ✅ **Transacciones de BD** - Consistencia garantizada
- ✅ **Idempotencia** - Prevención de procesamiento duplicado
- ✅ **Logging seguro** - Sin exponer información sensible

### Configuración de Webhook

Para recibir notificaciones de Mercado Pago:

1. Configura la URL del webhook en tu aplicación de Mercado Pago:
   ```
   https://tu-dominio.com/api/payments/webhook
   ```

2. En desarrollo, usa [ngrok](https://ngrok.com/) para exponer tu servidor local:
   ```bash
   ngrok http 3000
   # Usa la URL de ngrok en Mercado Pago
   ```

## 🧪 Testing

### Tarjetas de Prueba de Mercado Pago

- **Aprobada**: `5031 7557 3453 0604` (CVV: 123)
- **Rechazada**: `5031 4332 1540 6351` (CVV: 123)
- **Pendiente**: `5031 4332 1540 6351` (CVV: 123)

### Flujo de Prueba

1. Crea una preferencia usando `POST /api/payments/create-preference`
2. Redirige al usuario al `initPoint` recibido
3. Completa el pago con una tarjeta de prueba
4. Mercado Pago enviará una notificación al webhook
5. Verifica el estado usando `GET /api/payments/order/:orderId/status`

## 📊 Checklist de Calidad

Este proyecto cumple con **100% del checklist de implementación** de Mercado Pago:

- ✅ Campos obligatorios implementados
- ✅ Validación de webhooks
- ✅ Manejo completo de estados
- ✅ Reembolsos y cancelaciones
- ✅ Campos opcionales para mejorar aprobación
- ✅ Mejores prácticas de seguridad

Ver [análisis completo](./doc/ANALISIS-IMPLEMENTACION-CHECKOUT-PRO.md) para más detalles.

## 🔧 Configuración Avanzada

### Variables de Entorno Opcionales

```env
# Configuración de preferencias
PREFERENCE_EXPIRATION_DAYS=30
MAX_INSTALLMENTS=12

# Métodos de pago excluidos (separados por coma)
EXCLUDED_PAYMENT_METHODS=account_money,debit_card
EXCLUDED_PAYMENT_TYPES=credit_card

# Montos mínimos y máximos (opcional)
MIN_PAYMENT_AMOUNT=0.01
MAX_PAYMENT_AMOUNT=1000000
```

### Personalización

Este template está diseñado para ser fácilmente personalizable:

- **DTOs**: Modifica `src/payments/dto/create-order.dto.ts` para agregar campos
- **Servicio**: Extiende `src/payments/mercadopago.service.ts` para agregar lógica
- **Entidades**: Ajusta las entidades en `src/payments/entities/` según tus necesidades

## 🐛 Troubleshooting

### Error: "MERCADOPAGO_ACCESS_TOKEN is required"

- Verifica que la variable de entorno esté configurada en `.env`
- Asegúrate de que el archivo `.env` esté en la raíz del proyecto

### Error de conexión a PostgreSQL

```bash
# Verificar que Docker esté corriendo
docker ps

# Verificar que el contenedor esté activo
docker-compose ps

# Ver logs
docker-compose logs postgres
```

### Webhook no recibe notificaciones

- Verifica que la URL del webhook sea accesible públicamente
- En desarrollo, usa ngrok para exponer tu servidor local
- Verifica que la URL esté configurada correctamente en Mercado Pago
- Revisa los logs de la aplicación

## 📚 Recursos Adicionales

- [Documentación Oficial de Mercado Pago](https://www.mercadopago.com/developers/es/docs)
- [SDK de Mercado Pago para Node.js](https://github.com/mercadopago/sdk-nodejs)
- [Documentación de NestJS](https://docs.nestjs.com/)
- [Documentación de TypeORM](https://typeorm.io/)

## 🤝 Contribuir

Este es un template base. Siéntete libre de:

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## 📝 Licencia

Este proyecto está bajo la Licencia MIT. Ver el archivo `LICENSE` para más detalles.

## ⚠️ Notas Importantes

1. **Producción**: Asegúrate de configurar `MERCADOPAGO_WEBHOOK_SECRET` en producción
2. **HTTPS**: Requerido en producción para webhooks
3. **Migraciones**: En producción, usa migraciones de TypeORM en lugar de `synchronize: true`
4. **Backups**: Realiza backups regulares de la base de datos
5. **Monitoreo**: Implementa logging y monitoreo en producción

## 🎉 ¡Listo para usar!

Este template está completamente funcional y listo para usar como base de tu integración con Mercado Pago. 

**¿Necesitas ayuda?** Revisa la [documentación completa](./doc/README-MERCADOPAGO.md) o los [casos de uso](./doc/README-MERCADOPAGO.md#casos-de-uso).

---

**Desarrollado con ❤️ usando NestJS y Mercado Pago**
