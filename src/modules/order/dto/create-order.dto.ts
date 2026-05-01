import { Type } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { CreateAddressDto } from 'src/modules/address/dto/create-address-dto';

export class CreateOrderDto {
  @IsUUID()
  reservationId!: string;

  @IsEmail()
  customerEmail!: string;

  @IsString()
  @IsOptional()
  customerPhone?: string;

  @ValidateNested()
  @Type(() => CreateAddressDto)
  shippingAddress!: CreateAddressDto;

  @IsOptional()
  sameAsShipping?: boolean;

  @IsString()
  @IsOptional()
  notes?: string;
}
