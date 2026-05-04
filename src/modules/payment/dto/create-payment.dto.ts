import { IsUUID, IsNumber, IsString, IsOptional, Min } from 'class-validator';

export class CreatePaymentDto {
  @IsUUID()
  orderId!: string;

  @IsNumber()
  @Min(1)
  amount!: number;

  @IsString()
  currency!: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
