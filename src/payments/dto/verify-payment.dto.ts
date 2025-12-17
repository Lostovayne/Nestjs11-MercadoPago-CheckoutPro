import { IsString, IsNotEmpty, IsUUID } from 'class-validator';

export class VerifyPaymentDto {
  @IsString()
  @IsNotEmpty()
  @IsUUID()
  paymentId: string;
}
