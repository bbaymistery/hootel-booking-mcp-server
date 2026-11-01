import path from 'node:path';

export interface AppConfig {
  dbPath: string;
  busyTimeoutMs: number;
  maxDeliveryAttempts: number;
  retryDelaysMs: readonly [number, number, number, number];
}

export const config: AppConfig = {
  dbPath: process.env['HOTEL_DB_PATH'] ?? path.resolve(process.cwd(), 'hotel_booking.db'),
  busyTimeoutMs: 5000,
  maxDeliveryAttempts: 5,
  retryDelaysMs: [1000, 5000, 15000, 30000] as const
};
