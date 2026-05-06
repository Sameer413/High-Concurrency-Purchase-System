import { IsString, IsEmail, IsNotEmpty, IsOptional } from 'class-validator';

/**
 * Order Confirmation Email Job DTO
 * Only pass orderId - processor will fetch order details
 */
export class OrderConfirmationEmailDto {
  @IsString()
  @IsNotEmpty()
  orderId: string;
}

/**
 * Payment Success Email Job DTO
 * Only pass orderId - processor will fetch order details
 */
export class PaymentSuccessEmailDto {
  @IsString()
  @IsNotEmpty()
  orderId: string;
}

/**
 * Payment Failed Email Job DTO
 */
export class PaymentFailedEmailDto {
  @IsString()
  @IsNotEmpty()
  orderId: string;

  @IsString()
  @IsOptional()
  reason?: string;
}
