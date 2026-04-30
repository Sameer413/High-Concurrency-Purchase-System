import { IsEmail, IsNumber, IsOptional, IsPositive, IsString, IsUUID, Length } from 'class-validator';

export class CreateOrderDto {
  @IsUUID()
  productId: string;

  @IsNumber()
  @IsPositive()
  quantity: number;

  @IsEmail()
  customerEmail: string;

  @IsString()
  @IsOptional()
  @Length(1, 20)
  customerPhone?: string;

  @IsString()
  @Length(1, 100)
  shippingFirstName: string;

  @IsString()
  @Length(1, 100)
  shippingLastName: string;

  @IsString()
  @Length(1, 255)
  shippingAddressLine1: string;

  @IsString()
  @IsOptional()
  @Length(1, 255)
  shippingAddressLine2?: string;

  @IsString()
  @Length(1, 100)
  shippingCity: string;

  @IsString()
  @Length(1, 100)
  shippingState: string;

  @IsString()
  @Length(1, 20)
  shippingPostalCode: string;

  @IsString()
  @Length(1, 100)
  shippingCountry: string;

  @IsOptional()
  sameAsShipping?: boolean;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  specialInstructions?: string;

  @IsString()
  @IsOptional()
  @Length(1, 255)
  transactionId?: string;

  @IsNumber()
  @IsPositive()
  unitPrice: number;

  @IsOptional()
  selectedSize?: string;

  @IsOptional()
  selectedColor?: string;

  @IsNumber()
  @IsPositive()
  subtotal: number;

  @IsNumber()
  @IsOptional()
  taxAmount?: number;

  @IsNumber()
  @IsOptional()
  shippingCost?: number;

  @IsNumber()
  @IsOptional()
  discountAmount?: number;

  @IsNumber()
  @IsPositive()
  totalAmount: number;

  @IsString()
  @IsOptional()
  @Length(3, 3)
  currency?: string;

  @IsUUID()
  @IsOptional()
  userId?: string;
}