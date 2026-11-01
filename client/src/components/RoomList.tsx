import React from 'react';
import type { AvailableRoom, Room } from '../types/api.ts';
import { RoomCard } from './RoomCard.tsx';

interface RoomListProps {
  rooms: Array<AvailableRoom | Room>;
  isLoading: boolean;
  nights: number;
  isFiltered: boolean;
  onBook: (room: AvailableRoom | Room) => void;
}

export const RoomList: React.FC<RoomListProps> = ({
  rooms,
  isLoading,
  nights,
  isFiltered,
  onBook
}) => {
  if (isLoading) {
    return (
      <div className="rooms-grid">
        <div className="skeleton-card" />
        <div className="skeleton-card" />
        <div className="skeleton-card" />
      </div>
    );
  }

  if (rooms.length === 0) {
    return (
      <div className="alert-empty">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 1rem', color: '#94a3b8' }}>
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/>
          <line x1="8" y1="2" x2="8" y2="6"/>
          <line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--primary)', marginBottom: '0.5rem' }}>
          {isFiltered ? 'No Rooms Available for the Selected Dates' : 'No Rooms Found'}
        </h3>
        <p style={{ maxWidth: '420px', margin: '0 auto', fontSize: '0.95rem' }}>
          {isFiltered
            ? 'All matching rooms are reserved for these dates or exceed guest limits. Please adjust your dates or party size.'
            : 'The room catalog is currently being updated. Please check back shortly.'}
        </p>
      </div>
    );
  }

  return (
    <div className="rooms-grid">
      {rooms.map((room) => {
        const key = 'room_id' in room ? room.room_id : room.id;
        return <RoomCard key={key} room={room} nights={nights} onBook={onBook} />;
      })}
    </div>
  );
};
