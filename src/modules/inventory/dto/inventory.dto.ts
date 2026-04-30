import { IsInt, IsUUID, Min, IsOptional } from 'class-validator';

export class ReserveStockDto {
  @IsInt()
  @Min(1, { message: 'Quantity must be at least 1' })
  quantity!: number;
}

export class ReleaseReservationDto {
  @IsInt()
  @Min(1, { message: 'Quantity must be at least 1' })
  quantity!: number;
}

export class ConfirmSaleDto {
  @IsInt()
  @Min(1, { message: 'Quantity must be at least 1' })
  quantity!: number;
}

export class RestockDto {
  @IsInt()
  @Min(1, { message: 'Quantity must be at least 1' })
  quantity!: number;
}

export class UpsertInventoryDto {
  @IsUUID()
  productId!: string;

  @IsInt()
  @Min(0)
  totalStock!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  reservedStock?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  soldStock?: number;
}

export class CheckAvailabilityDto {
  @IsInt()
  @Min(1, { message: 'Quantity must be at least 1' })
  quantity!: number;
}
