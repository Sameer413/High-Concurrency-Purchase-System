import { IsUUID, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateOrderItemDto {
  @IsUUID()
  productId!: string;

  @IsNumber()
  quantity!: number;

  @IsOptional()
  @IsString()
  selectedSize?: string;

  @IsOptional()
  @IsString()
  selectedColor?: string;
}
