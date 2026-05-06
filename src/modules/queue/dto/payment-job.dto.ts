/**
 * DTO for stock conversion job
 */
export interface ConvertStockJobDto {
  orderId: string;
  orderNumber: string;
  reservationId: string;
  items: Array<{
    productId: string;
    quantity: number;
  }>;
}

/**
 * DTO for reservation completion job
 */
export interface CompleteReservationJobDto {
  orderId: string;
  orderNumber: string;
  reservationId: string;
}
