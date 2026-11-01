import React, { useState } from 'react';

interface SearchBarProps {
  initialCheckIn: string;
  initialCheckOut: string;
  initialGuests: number;
  onSearch: (checkIn: string, checkOut: string, guests: number) => void;
  isLoading: boolean;
}

export const SearchBar: React.FC<SearchBarProps> = ({
  initialCheckIn,
  initialCheckOut,
  initialGuests,
  onSearch,
  isLoading
}) => {
  const [checkIn, setCheckIn] = useState(initialCheckIn);
  const [checkOut, setCheckOut] = useState(initialCheckOut);
  const [guests, setGuests] = useState(initialGuests);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (checkIn && checkOut && checkOut > checkIn) {
      onSearch(checkIn, checkOut, guests);
    }
  };

  const handleCheckInChange = (newCheckIn: string) => {
    setCheckIn(newCheckIn);
    // If checkOut is now on or before newCheckIn, automatically advance checkOut by 1 day
    if (checkOut <= newCheckIn) {
      const nextDay = new Date(newCheckIn);
      nextDay.setDate(nextDay.getDate() + 1);
      setCheckOut(nextDay.toISOString().split('T')[0] ?? '');
    }
  };

  return (
    <div className="search-box-card">
      <form onSubmit={handleSubmit} className="search-form">
        <div className="form-group">
          <label className="form-label">Check-In Date</label>
          <input
            type="date"
            className="form-input"
            value={checkIn}
            min="2024-01-01"
            max="2099-12-31"
            required
            onChange={(e) => handleCheckInChange(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label className="form-label">Check-Out Date</label>
          <input
            type="date"
            className="form-input"
            value={checkOut}
            min={checkIn}
            max="2099-12-31"
            required
            onChange={(e) => setCheckOut(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label className="form-label">Guests</label>
          <select
            className="form-select"
            value={guests}
            onChange={(e) => setGuests(Number(e.target.value))}
          >
            {[1, 2, 3, 4, 5, 6].map((num) => (
              <option key={num} value={num}>
                {num} {num === 1 ? 'Guest' : 'Guests'}
              </option>
            ))}
          </select>
        </div>

        <button type="submit" className="btn-primary" disabled={isLoading || checkOut <= checkIn}>
          {isLoading ? (
            'Searching...'
          ) : (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/>
                <line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <span>Search Rooms</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
};
