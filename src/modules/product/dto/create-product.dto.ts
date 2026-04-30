import { IsBoolean, IsNumber, IsOptional, IsPositive, IsString, Length, Min } from 'class-validator';

export class CreateProductDto {
  @IsString()
  @Length(2, 160)
  name: string;

  @IsString()
  @IsOptional()
  @Length(0, 2000)
  description?: string;

  @IsNumber()
  @IsPositive()
  price: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  stock?: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
