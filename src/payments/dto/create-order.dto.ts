import {
  IsString,
  IsEmail,
  IsNumber,
  IsArray,
  ValidateNested,
  IsOptional,
  IsPositive,
  Min,
  MaxLength,
  IsUrl,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateOrderItemDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  productId?: string;

  @IsNumber()
  @IsPositive()
  @Min(1)
  quantity: number;

  @IsNumber()
  @IsPositive()
  @Min(0.01)
  unitPrice: number;

  @IsOptional()
  @IsUrl()
  @MaxLength(500)
  pictureUrl?: string;

  /**
   * ID de categoría del item según Mercado Pago
   * Recomendado para mejorar la tasa de aprobación
   * Categorías comunes: electronics, clothing, home, food, services, others
   */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  categoryId?: string;

  @IsOptional()
  metadata?: Record<string, any>;
}

export class CreateOrderDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items: CreateOrderItemDto[];

  @IsEmail()
  @MaxLength(255)
  customerEmail: string;

  /**
   * Nombre completo del cliente (usado como fallback si no hay firstName/lastName)
   */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  customerName?: string;

  /**
   * Nombre del cliente (recomendado para mejorar tasa de aprobación)
   */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  customerFirstName?: string;

  /**
   * Apellido del cliente (recomendado para mejorar tasa de aprobación)
   */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  customerLastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  customerPhone?: string;

  /**
   * Tipo de identificación del cliente (DNI, CPF, CI, etc.)
   * Recomendado para mejorar tasa de aprobación
   */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  customerIdentificationType?: string;

  /**
   * Número de identificación del cliente
   * Recomendado para mejorar tasa de aprobación
   */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  customerIdentificationNumber?: string;

  /**
   * Dirección del cliente (opcional, mejora tasa de aprobación)
   */
  @IsOptional()
  @ValidateNested()
  @Type(() => CustomerAddressDto)
  customerAddress?: CustomerAddressDto;

  /**
   * Monto del envío si ya está calculado
   */
  @IsOptional()
  @IsNumber()
  @Min(0)
  shipmentAmount?: number;

  /**
   * Número máximo de cuotas permitidas (1-12)
   */
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(12)
  maxInstallments?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  metadata?: Record<string, any>;
}

export class CustomerAddressDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  streetName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  streetNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  zipCode?: string;
}
