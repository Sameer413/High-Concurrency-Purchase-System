export type ReservationItemDTO = {
  productId: string;

  // 🔥 CRITICAL (price snapshot)
  unitPrice: number;

  // Optional but useful
  currency: 'INR';

  quantity: number;

  // 🔥 Product snapshot (avoid DB dependency later)
  productName: string;
  productImage?: string;

  // Optional: variant info
  variantId?: string;

  // 🔥 Pricing integrity
  totalPrice: number;
};
