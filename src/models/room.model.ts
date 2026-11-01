export type RoomStatus = 'AVAILABLE' | 'MAINTENANCE' | 'INACTIVE';

export interface RoomRecord {
  id: string;
  name: string;
  capacity: number;
  price_per_night_cents: number;
  status: RoomStatus;
}
