export interface RoomMeta {
  imageUrl: string;
  badge: string;
  amenities: string[];
  description: string;
}

export const ROOM_META_MAP: Record<string, RoomMeta> = {
  room_deluxe_101: {
    imageUrl: 'https://images.unsplash.com/photo-1591088398332-8a7791972843?auto=format&fit=crop&w=800&q=80',
    badge: 'Popular Choice',
    amenities: ['Ocean View', 'King Bed', 'Balcony', 'Free WiFi', 'Espresso Machine'],
    description: 'Breathtaking ocean panoramas, a handcrafted California King bed, Italian marble bath, and private sunset balcony.'
  },
  room_queen_102: {
    imageUrl: 'https://images.unsplash.com/photo-1566665797739-1674de7a421a?auto=format&fit=crop&w=800&q=80',
    badge: 'Family Favorite',
    amenities: ['2 Queen Beds', 'Rainfall Shower', 'Smart TV', 'Work Desk'],
    description: 'Spacious accommodation equipped with dual luxury queen beds, quiet courtyard acoustic shielding, and walk-in rain shower.'
  },
  room_suite_201: {
    imageUrl: 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=800&q=80',
    badge: 'Luxury Penthouse',
    amenities: ['Private Jacuzzi', 'Dining Room', 'Skyline Terrace', 'Butler Service'],
    description: 'Our crown jewel penthouse featuring floor-to-ceiling glass, rooftop terrace, private heated jacuzzi, and bespoke concierge.'
  },
  room_cozy_301: {
    imageUrl: 'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=800&q=80',
    badge: 'Solo Executive',
    amenities: ['1 Double Bed', 'Ergonomic Desk', 'Fiber Internet', 'Kitchenette'],
    description: 'Sleek, soundproofed designer micro-suite tailored for productive remote work and uninterrupted deep rest.'
  },
  room_maint_901: {
    imageUrl: 'https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=800&q=80',
    badge: 'Maintenance',
    amenities: ['Under Renovation'],
    description: 'Currently undergoing luxury interior refurbishment to elevate the guest experience.'
  }
};

export function getRoomMeta(roomId: string): RoomMeta {
  return (
    ROOM_META_MAP[roomId] ?? {
      imageUrl: 'https://images.unsplash.com/photo-1618773928121-c32242e63f39?auto=format&fit=crop&w=800&q=80',
      badge: 'Comfort Room',
      amenities: ['Air Conditioning', 'Ensuite Bathroom', 'WiFi'],
      description: 'Sophisticated modern accommodations designed for tranquil relaxation and supreme comfort.'
    }
  );
}
