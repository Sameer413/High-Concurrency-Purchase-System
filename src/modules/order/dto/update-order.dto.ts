import { IsEmail, IsNumber, IsOptional, IsString, IsBoolean, Length } from 'class-validator';

export class UpdateOrderDto {
  @IsEmail()
  @IsOptional()
  customerEmail?: string;

  @IsString()
  @IsOptional()
  @Length(1, 20)
  customerPhone?: string;

  @IsString()
  @IsOptional()
  @Length(1, 100)
  shippingFirstName?: string;

  @IsString()
  @IsOptional()
  @Length(1, 100)
  shippingLastName?: string;

  @IsString()
  @IsOptional()
  @Length(1, 255)
  shippingAddressLine1?: string;

  @IsString()
  @IsOptional()
  @Length(1, 255)
  shippingAddressLine2?: string;

  @IsString()
  @IsOptional()
  @Length(1, 100)
  shippingCity?: string;

  @IsString()
  @IsOptional()
  @Length(1, 100)
  shippingState?: string;

  @IsString()
  @IsOptional()
  @Length(1, 20)
  shippingPostalCode?: string;

  @IsString()
  @IsOptional()
  @Length(1, 100)
  shippingCountry?: string;

  @IsBoolean()
  @IsOptional()
  sameAsShipping?: boolean;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  specialInstructions?: string;
}

