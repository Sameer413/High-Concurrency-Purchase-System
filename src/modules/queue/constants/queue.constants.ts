/**
 * Queue Names
 * Centralized queue name constants
 */
export const QUEUE_NAMES = {
  EMAIL_NOTIFICATIONS: 'email-notifications',
  // Future queues can be added here:
  PAYMENT_PROCESSING: 'payment-processing',
  // WEBHOOK_PROCESSING: 'webhook-processing',
  // RESERVATION_EXPIRY: 'reservation-expiry',
} as const;

/**
 * Job Names
 * Centralized job name constants for type safety
 */
export const JOB_NAMES = {
  // Email jobs
  SEND_ORDER_CONFIRMATION: 'send-order-confirmation',
  SEND_PAYMENT_SUCCESS: 'send-payment-success',
  SEND_PAYMENT_FAILED: 'send-payment-failed',

  // Payment processing jobs
  CONVERT_STOCK: 'convert-stock',
  COMPLETE_RESERVATION: 'complete-reservation',
} as const;

/**
 * Queue Configuration
 * Default options for queues
 */
export const QUEUE_CONFIG = {
  EMAIL_NOTIFICATIONS: {
    defaultJobOptions: {
      attempts: 3, // Retry up to 3 times
      backoff: {
        type: 'exponential' as const,
        delay: 2000, // Start with 2 second delay
      },
      removeOnComplete: {
        age: 24 * 3600, // Keep completed jobs for 24 hours
        count: 100, // Keep last 100 completed jobs
      },
      removeOnFail: {
        age: 7 * 24 * 3600, // Keep failed jobs for 7 days
        count: 500, // Keep last 500 failed jobs
      },
    },
  },
  PAYMENT_PROCESSING: {
    defaultJobOptions: {
      attempts: 5, // More retries for critical operations
      backoff: {
        type: 'exponential' as const,
        delay: 1000, // Start with 1 second delay
      },
      removeOnComplete: {
        age: 7 * 24 * 3600, // Keep completed jobs for 7 days (audit trail)
        count: 1000,
      },
      removeOnFail: {
        age: 30 * 24 * 3600, // Keep failed jobs for 30 days
        count: 1000,
      },
    },
  },
} as const;
