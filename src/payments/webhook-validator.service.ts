import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class WebhookValidatorService {
  private readonly logger = new Logger(WebhookValidatorService.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * Valida la firma del webhook de Mercado Pago
   * @param xSignature - Header x-signature
   * @param xRequestId - Header x-request-id
   * @param dataId - ID del recurso notificado
   * @param rawBody - Cuerpo de la petición sin parsear
   */
  validateWebhookSignature(
    xSignature: string,
    xRequestId: string,
    dataId: string,
  ): boolean {
    try {
      if (!xSignature || !xRequestId) {
        this.logger.warn('Webhook recibido sin firma o request ID');
        return false;
      }

      const secret = this.configService.get<string>(
        'MERCADOPAGO_WEBHOOK_SECRET',
      );

      if (!secret) {
        this.logger.warn(
          'MERCADOPAGO_WEBHOOK_SECRET no configurado, saltando validación',
        );
        // En producción, esto debería lanzar un error
        // En desarrollo, permitimos continuar pero logueamos la advertencia
        return true;
      }

      // Parsear el header x-signature
      const signatureParts = this.parseSignatureHeader(xSignature);
      if (!signatureParts) {
        this.logger.error('No se pudo parsear el header x-signature');
        return false;
      }

      const { ts, hash } = signatureParts;

      // Construir el mensaje a firmar según la documentación de Mercado Pago
      // Formato: id={data.id}&request-id={x-request-id}&ts={ts}
      const manifest = `id=${dataId};request-id=${xRequestId};ts=${ts}`;

      // Generar HMAC SHA256
      const hmac = crypto.createHmac('sha256', secret);
      hmac.update(manifest);
      const expectedHash = hmac.digest('hex');

      // Comparar los hashes de forma segura
      const isValid = crypto.timingSafeEqual(
        Buffer.from(hash),
        Buffer.from(expectedHash),
      );

      if (!isValid) {
        this.logger.error('Firma de webhook inválida');
        this.logger.debug(`Hash esperado: ${expectedHash}`);
        this.logger.debug(`Hash recibido: ${hash}`);
        this.logger.debug(`Manifest: ${manifest}`);
      } else {
        this.logger.log('Firma de webhook validada correctamente');
      }

      return isValid;
    } catch (error) {
      this.logger.error(
        `Error al validar firma de webhook: ${error.message}`,
        error.stack,
      );
      return false;
    }
  }

  /**
   * Parsea el header x-signature de Mercado Pago
   * Formato: ts=1234567890,v1=hash_value
   */
  private parseSignatureHeader(
    signature: string,
  ): { ts: string; hash: string } | null {
    try {
      const parts = signature.split(',');
      let ts: string | undefined;
      let hash: string | undefined;

      for (const part of parts) {
        const [key, value] = part.trim().split('=');
        if (key === 'ts') {
          ts = value;
        } else if (key === 'v1') {
          hash = value;
        }
      }

      if (!ts || !hash) {
        return null;
      }

      return { ts, hash };
    } catch (error) {
      this.logger.error(
        `Error al parsear header de firma: ${error.message}`,
        error.stack,
      );
      return null;
    }
  }

  /**
   * Verifica si un webhook es demasiado antiguo (protección contra replay attacks)
   * @param timestamp - Timestamp del webhook en segundos
   * @param maxAgeSeconds - Edad máxima permitida en segundos (default: 5 minutos)
   */
  isWebhookTooOld(timestamp: string, maxAgeSeconds = 300): boolean {
    try {
      const webhookTime = parseInt(timestamp, 10);
      const currentTime = Math.floor(Date.now() / 1000);
      const age = currentTime - webhookTime;

      if (age > maxAgeSeconds) {
        this.logger.warn(
          `Webhook rechazado: demasiado antiguo (${age} segundos)`,
        );
        return true;
      }

      return false;
    } catch (error) {
      this.logger.error(
        `Error al verificar edad del webhook: ${error.message}`,
      );
      return true;
    }
  }
}
