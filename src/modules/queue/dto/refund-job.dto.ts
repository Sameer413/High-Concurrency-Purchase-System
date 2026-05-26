/**
 * Refund Job DTOs
 * Data transfer objects for refund processing jobs
 */

export class InitiateRefundJobDto {
  orderId: string;
  orderNumber: string;
  paymentId: string;
  razorpayPaymentId: string;
  amount: number;
  currency: string;
  reason: string;
}

export class CheckRefundStatusJobDto {
  orderId: string;
  orderNumber: string;
  refundId: string;
  razorpayRefundId: string;
  attemptNumber: number;
}
