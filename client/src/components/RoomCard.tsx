import React from 'react';
import type { AvailableRoom, Room } from '../types/api.ts';
import { getRoomMeta } from '../utils/room-meta.ts';

interface RoomCardProps {
  room: AvailableRoom | Room;
  nights?: number;
  onBook: (room: AvailableRoom | Room) => void;
}

export const RoomCard: React.FC<RoomCardProps> = ({ room, nights, onBook }) => {
  const roomId = 'room_id' in room ? room.room_id : room.id;
  const meta = getRoomMeta(roomId);
  const isAvailable = 'availability_status' in room
    ? room.availability_status === 'AVAILABLE'
    : room.status === 'AVAILABLE';

  return (
    <div className="room-card">
      <div className="room-image-wrapper">
        <img src={meta.imageUrl} alt={room.name} className="room-image" loading="lazy" />
        <span className="room-badge">{meta.badge}</span>
        <span className="room-capacity-badge">
          Up to {room.capacity} {room.capacity === 1 ? 'Guest' : 'Guests'}
        </span>
      </div>

      <div className="room-body">
        <h3 className="room-title">{room.name}</h3>
        <p className="room-description">{meta.description}</p>

        <div className="amenities-list">
          {meta.amenities.map((item) => (
            <span key={item} className="amenity-tag">
              {item}
            </span>
          ))}
        </div>

        <div className="room-footer">
          <div className="price-container">
            <span className="price-night">{room.price_per_night_formatted}</span>
            {'total_price_formatted' in room && nights && nights > 0 ? (
              <span className="price-total">
                Total for {nights} {nights === 1 ? 'night' : 'nights'}: {room.total_price_formatted}
              </span>
            ) : (
              <span className="price-total" style={{ color: 'var(--text-muted)' }}>
                Per night
              </span>
            )}
          </div>

          <button
            className="btn-primary"
            style={{ height: '42px', padding: '0.6rem 1.25rem' }}
            disabled={!isAvailable}
            onClick={() => onBook(room)}
          >
            {isAvailable ? 'Book Room' : 'Unavailable'}
          </button>
        </div>
      </div>
    </div>
  );
};
