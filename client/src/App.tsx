import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Room, AvailableRoom, BookingConfirmation, UnavailableRoomInfo } from './types/api.ts';
import { fetchHealth, checkAvailability, fetchCatalogRooms, ApiClientError } from './api/client.ts';
import { Header } from './components/Header.tsx';
import { SearchBar } from './components/SearchBar.tsx';
import { RoomList } from './components/RoomList.tsx';
import { BookingModal } from './components/BookingModal.tsx';
import { ConfirmationModal } from './components/ConfirmationModal.tsx';
import { ChatWidget } from './components/ChatWidget.tsx';
import { getRoomMeta } from './utils/room-meta.ts';

export function App() {
  const [apiStatus, setApiStatus] = useState<'connected' | 'connecting' | 'error'>('connecting');

  // Default dates: tomorrow -> 4 nights later
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const defaultCheckIn = tomorrow.toISOString().split('T')[0] ?? '2026-11-10';

  const defaultOutDate = new Date(tomorrow);
  defaultOutDate.setDate(defaultOutDate.getDate() + 4);
  const defaultCheckOut = defaultOutDate.toISOString().split('T')[0] ?? '2026-11-14';

  const [checkIn, setCheckIn] = useState(defaultCheckIn);
  const [checkOut, setCheckOut] = useState(defaultCheckOut);
  const [guests, setGuests] = useState(2);
  const [nights, setNights] = useState(4);

  const [rooms, setRooms] = useState<Array<AvailableRoom | Room>>([]);
  const [unavailableRooms, setUnavailableRooms] = useState<UnavailableRoomInfo[]>([]);
  const [catalogRooms, setCatalogRooms] = useState<Room[]>([]);
  const [selectedRoomType, setSelectedRoomType] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isFiltered, setIsFiltered] = useState(false);

  // Modals state
  const [selectedRoom, setSelectedRoom] = useState<AvailableRoom | Room | null>(null);
  const [bookingConfirmation, setBookingConfirmation] = useState<BookingConfirmation | null>(null);

  // Check health and load room catalog on mount
  useEffect(() => {
    fetchHealth()
      .then(() => setApiStatus('connected'))
      .catch(() => setApiStatus('error'));

    fetchCatalogRooms()
      .then((data) => setCatalogRooms(data))
      .catch((err) => console.error('Failed to load room catalog', err));
  }, []);

  const handleSearch = useCallback(async (inDate: string, outDate: string, guestCount: number) => {
    setIsLoading(true);
    setErrorMessage(null);
    setCheckIn(inDate);
    setCheckOut(outDate);
    setGuests(guestCount);

    try {
      const res = await checkAvailability(inDate, outDate, guestCount);
      setRooms(res.rooms);
      setUnavailableRooms(res.unavailable_rooms ?? []);
      setNights(res.nights);
      setIsFiltered(true);
      setApiStatus('connected');
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Unable to connect to booking service. Loading full catalog...');
        // Fallback to basic catalog if search fails
        const catalog = await fetchCatalogRooms().catch(() => []);
        setRooms(catalog);
        setUnavailableRooms([]);
      }
      setApiStatus('error');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial load on startup
  useEffect(() => {
    handleSearch(defaultCheckIn, defaultCheckOut, 2);
  }, [defaultCheckIn, defaultCheckOut, handleSearch]);

  const handleBookingSuccess = (confirmation: BookingConfirmation) => {
    setSelectedRoom(null);
    setBookingConfirmation(confirmation);
    // Refresh availability search so booked room reflects immediately
    handleSearch(checkIn, checkOut, guests);
  };

  const displayedRooms = useMemo(() => {
    if (selectedRoomType === 'all') {
      return rooms;
    }
    return rooms.filter((r) => {
      const id = 'room_id' in r ? r.room_id : r.id;
      return id === selectedRoomType;
    });
  }, [rooms, selectedRoomType]);

  return (
    <div>
      <Header apiStatus={apiStatus} />

      <section className="hero-section">
        <div className="hero-content">
          <h1 className="hero-heading">Timeless Elegance, Modern AI Precision</h1>
          <p className="hero-desc">
            Experience world-class luxury accommodations powered by Neon PostgreSQL, real-time MCP transactions, and Gemini AI Concierge.
          </p>
        </div>
      </section>

      <SearchBar
        initialCheckIn={checkIn}
        initialCheckOut={checkOut}
        initialGuests={guests}
        onSearch={handleSearch}
        isLoading={isLoading}
      />

      {/* Hotel Room Types Showcase & Navigation Bar (Positioned under Search Bar) */}
      <section style={{ maxWidth: '1050px', margin: '-1rem auto 2.2rem', padding: '0 1rem' }}>
        <div
          style={{
            background: '#ffffff',
            border: '1.5px solid #e2e8f0',
            borderRadius: '16px',
            padding: '20px',
            boxShadow: '0 6px 24px rgba(0, 0, 0, 0.06)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '16px',
              flexWrap: 'wrap',
              gap: '10px',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.3rem' }}>🏨</span>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '0.02em' }}>
                  Grand Horizon Suites & Accommodations
                </h3>
                <span style={{ background: '#f1f5f9', color: '#475569', fontSize: '0.72rem', padding: '2px 8px', borderRadius: '9999px', fontWeight: 700 }}>
                  {catalogRooms.length || 5} Categories
                </span>
              </div>
              <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: '#64748b' }}>
                Select any suite below to inspect live calendar availability, pricing, or booked schedules
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#166534', fontWeight: 600 }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#16a34a', display: 'inline-block' }} />
                Available
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#991b1b', fontWeight: 600, marginLeft: '6px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#dc2626', display: 'inline-block' }} />
                Booked
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#475569', fontWeight: 600, marginLeft: '6px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#94a3b8', display: 'inline-block' }} />
                Maintenance
              </span>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
              gap: '12px',
            }}
          >
            {/* All Accommodations Pill */}
            <button
              onClick={() => setSelectedRoomType('all')}
              style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: '8px',
                padding: '14px 16px',
                borderRadius: '12px',
                border: selectedRoomType === 'all' ? '2px solid #c5a059' : '1px solid #e2e8f0',
                background: selectedRoomType === 'all' ? 'linear-gradient(135deg, #fffdfa 0%, #faf5eb 100%)' : '#ffffff',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s ease',
                boxShadow: selectedRoomType === 'all' ? '0 4px 12px rgba(197, 160, 89, 0.25)' : 'none',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '1.1rem' }}>🌟</span>
                  <span style={{ fontWeight: 800, fontSize: '0.92rem', color: selectedRoomType === 'all' ? '#92400e' : '#0f172a' }}>
                    All Accommodations
                  </span>
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>
                  Showing full hotel catalog
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                <span style={{ fontSize: '0.72rem', color: '#475569', fontWeight: 600 }}>
                  5 Total Suites
                </span>
                <span style={{ fontSize: '0.72rem', background: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: '6px', fontWeight: 700 }}>
                  {rooms.length} Open Now
                </span>
              </div>
            </button>

            {/* Individual Room Category Pills */}
            {catalogRooms.map((r) => {
              const isSelected = selectedRoomType === r.id;
              const isAvail = rooms.some((ar) => ('room_id' in ar ? ar.room_id === r.id : ar.id === r.id));
              const unavailInfo = unavailableRooms.find((u) => u.room_id === r.id);

              let badgeText = '🟢 Available';
              let badgeBg = '#dcfce7';
              let badgeColor = '#15803d';

              if (!isAvail && unavailInfo) {
                if (unavailInfo.reason === 'ALREADY_BOOKED') {
                  badgeText = unavailInfo.next_available_date
                    ? `🔴 Booked (Free ${unavailInfo.next_available_date.slice(5)})`
                    : '🔴 Reserved';
                  badgeBg = '#fee2e2';
                  badgeColor = '#991b1b';
                } else if (unavailInfo.reason === 'EXCEEDS_CAPACITY') {
                  badgeText = `🟡 Max ${r.capacity} Guest`;
                  badgeBg = '#fef3c7';
                  badgeColor = '#854d0e';
                } else {
                  badgeText = '🛠️ Under Renovation';
                  badgeBg = '#f1f5f9';
                  badgeColor = '#475569';
                }
              }

              return (
                <button
                  key={r.id}
                  onClick={() => setSelectedRoomType(isSelected ? 'all' : r.id)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '8px',
                    padding: '14px 16px',
                    borderRadius: '12px',
                    border: isSelected
                      ? '2px solid #c5a059'
                      : isAvail
                      ? '1px solid #cbd5e1'
                      : '1px dashed #cbd5e1',
                    background: isSelected
                      ? 'linear-gradient(135deg, #fffdfa 0%, #faf5eb 100%)'
                      : !isAvail
                      ? '#f8fafc'
                      : '#ffffff',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.2s ease',
                    boxShadow: isSelected ? '0 4px 12px rgba(197, 160, 89, 0.25)' : 'none',
                    opacity: !isAvail && !isSelected ? 0.88 : 1,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 800, fontSize: '0.9rem', color: isSelected ? '#92400e' : '#0f172a', lineHeight: '1.3' }}>
                      {r.name}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px', display: 'flex', justifyContent: 'space-between' }}>
                      <span>Max {r.capacity} {r.capacity === 1 ? 'Guest' : 'Guests'}</span>
                      <strong style={{ color: isAvail ? '#15803d' : '#64748b' }}>
                        {r.price_per_night_formatted}/night
                      </strong>
                    </div>
                  </div>

                  <div style={{ marginTop: '4px' }}>
                    <span
                      style={{
                        display: 'inline-block',
                        fontSize: '0.72rem',
                        background: badgeBg,
                        color: badgeColor,
                        padding: '2px 8px',
                        borderRadius: '6px',
                        fontWeight: 700,
                        letterSpacing: '0.2px',
                      }}
                    >
                      {badgeText}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <main className="main-container">
        {errorMessage && (
          <div className="alert-banner alert-error" style={{ maxWidth: '1050px', margin: '0 auto 2rem' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <span>{errorMessage}</span>
          </div>
        )}

        <div className="section-header">
          <div>
            <h2 className="section-title">
              {selectedRoomType !== 'all'
                ? catalogRooms.find((c) => c.id === selectedRoomType)?.name ?? 'Selected Suite'
                : 'Available Accommodations'}
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }}>
              <span style={{ fontSize: '0.85rem', color: '#64748b' }}>Showing live availability for:</span>
              <span
                style={{
                  background: '#0f172a',
                  color: '#ffffff',
                  padding: '3px 10px',
                  borderRadius: '6px',
                  fontWeight: 700,
                  fontSize: '0.82rem',
                  letterSpacing: '0.5px',
                }}
              >
                📅 {checkIn}
              </span>
              <span style={{ color: '#94a3b8' }}>→</span>
              <span
                style={{
                  background: '#0f172a',
                  color: '#ffffff',
                  padding: '3px 10px',
                  borderRadius: '6px',
                  fontWeight: 700,
                  fontSize: '0.82rem',
                  letterSpacing: '0.5px',
                }}
              >
                📅 {checkOut}
              </span>
              <span
                style={{
                  background: '#fef3c7',
                  color: '#92400e',
                  padding: '3px 10px',
                  borderRadius: '6px',
                  fontWeight: 800,
                  fontSize: '0.82rem',
                  border: '1px solid #fde68a',
                }}
              >
                {nights} {nights === 1 ? 'Night' : 'Nights'}
              </span>
              <span
                style={{
                  background: '#e0f2fe',
                  color: '#0369a1',
                  padding: '3px 10px',
                  borderRadius: '6px',
                  fontWeight: 800,
                  fontSize: '0.82rem',
                  border: '1px solid #bae6fd',
                }}
              >
                👥 {guests} {guests === 1 ? 'Guest' : 'Guests'}
              </span>
            </div>
          </div>
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>
            {displayedRooms.length} {displayedRooms.length === 1 ? 'suite' : 'suites'} available
          </span>
        </div>

        {/* When a specific room is selected and is Available */}
        {displayedRooms.length > 0 && (
          <RoomList
            rooms={displayedRooms}
            isLoading={isLoading}
            nights={nights}
            isFiltered={isFiltered}
            onBook={(room) => setSelectedRoom(room)}
          />
        )}

        {/* When a specific room is selected and is UNAVAILABLE: Show Smart Next Available Dates Card */}
        {selectedRoomType !== 'all' && displayedRooms.length === 0 && (
          <div style={{ maxWidth: '850px', margin: '2rem auto' }}>
            {(() => {
              const roomCatalog = catalogRooms.find((c) => c.id === selectedRoomType);
              const unavail = unavailableRooms.find((u) => u.room_id === selectedRoomType);
              const meta = getRoomMeta(selectedRoomType);

              if (!roomCatalog) return null;

              return (
                <div
                  style={{
                    background: '#ffffff',
                    border: '1.5px solid #e2e8f0',
                    borderRadius: '16px',
                    boxShadow: '0 8px 30px rgba(0, 0, 0, 0.08)',
                    overflow: 'hidden',
                  }}
                >
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 1fr) 1.2fr', gap: '0' }}>
                    {/* Photo */}
                    <div style={{ position: 'relative', minHeight: '260px' }}>
                      <img
                        src={meta.imageUrl}
                        alt={roomCatalog.name}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                      <span
                        style={{
                          position: 'absolute',
                          top: '14px',
                          left: '14px',
                          background: 'rgba(15, 23, 42, 0.85)',
                          backdropFilter: 'blur(4px)',
                          color: '#ffffff',
                          padding: '4px 10px',
                          borderRadius: '6px',
                          fontWeight: 700,
                          fontSize: '0.75rem',
                        }}
                      >
                        {meta.badge}
                      </span>
                    </div>

                    {/* Content & Intelligence */}
                    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>
                            {roomCatalog.name}
                          </h3>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>
                              {roomCatalog.price_per_night_formatted}
                            </div>
                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>per night</span>
                          </div>
                        </div>

                        <p style={{ margin: '8px 0 16px', fontSize: '0.85rem', color: '#64748b', lineHeight: 1.5 }}>
                          {meta.description}
                        </p>

                        {/* Smart Reason & Next Availability Callout */}
                        {unavail?.reason === 'ALREADY_BOOKED' && (
                          <div
                            style={{
                              background: '#fffbeb',
                              border: '1.5px solid #fde68a',
                              borderRadius: '12px',
                              padding: '14px 16px',
                              marginBottom: '16px',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#92400e', fontWeight: 700, fontSize: '0.9rem' }}>
                              <span>📅</span>
                              <span>Reserved for Selected Dates ({checkIn} → {checkOut})</span>
                            </div>
                            <p style={{ margin: '6px 0 10px', fontSize: '0.82rem', color: '#78350f', lineHeight: 1.45 }}>
                              This suite is occupied by a confirmed guest reservation through <strong>{unavail.next_available_date}</strong>.
                            </p>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#ffffff', padding: '8px 12px', borderRadius: '8px', border: '1px dashed #d97706' }}>
                              <span style={{ fontSize: '1rem' }}>✨</span>
                              <div style={{ fontSize: '0.82rem', color: '#92400e' }}>
                                <strong>Next Available Check-In:</strong> {unavail.next_available_date} onwards
                              </div>
                            </div>
                          </div>
                        )}

                        {unavail?.reason === 'EXCEEDS_CAPACITY' && (
                          <div
                            style={{
                              background: '#fefce8',
                              border: '1.5px solid #fef08a',
                              borderRadius: '12px',
                              padding: '14px 16px',
                              marginBottom: '16px',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#854d0e', fontWeight: 700, fontSize: '0.9rem' }}>
                              <span>👥</span>
                              <span>Party Exceeds Suite Capacity</span>
                            </div>
                            <p style={{ margin: '6px 0', fontSize: '0.82rem', color: '#713f12', lineHeight: 1.45 }}>
                              {roomCatalog.name} accommodates a maximum of <strong>{roomCatalog.capacity} {roomCatalog.capacity === 1 ? 'guest' : 'guests'}</strong> (your search is set to {guests} guests).
                            </p>
                          </div>
                        )}

                        {unavail?.reason === 'UNDER_MAINTENANCE' && (
                          <div
                            style={{
                              background: '#f8fafc',
                              border: '1.5px solid #cbd5e1',
                              borderRadius: '12px',
                              padding: '14px 16px',
                              marginBottom: '16px',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#334155', fontWeight: 700, fontSize: '0.9rem' }}>
                              <span>🛠️</span>
                              <span>Under Scheduled Luxury Maintenance</span>
                            </div>
                            <p style={{ margin: '6px 0', fontSize: '0.82rem', color: '#475569', lineHeight: 1.45 }}>
                              The Executive Suite is undergoing scheduled acoustic isolation and master bath upgrade to meet 5-star standards.
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Action Buttons */}
                      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', paddingTop: '8px' }}>
                        {unavail?.reason === 'ALREADY_BOOKED' && unavail.next_available_date && (
                          <button
                            onClick={() => {
                              const nextIn = unavail.next_available_date!;
                              const nextOutDate = new Date(nextIn);
                              nextOutDate.setDate(nextOutDate.getDate() + 4);
                              const nextOut = nextOutDate.toISOString().split('T')[0] ?? '';
                              handleSearch(nextIn, nextOut, guests);
                            }}
                            style={{
                              flex: 1,
                              background: 'linear-gradient(135deg, #c5a059 0%, #b38f46 100%)',
                              color: '#ffffff',
                              border: 'none',
                              borderRadius: '8px',
                              padding: '12px 18px',
                              fontWeight: 700,
                              fontSize: '0.86rem',
                              cursor: 'pointer',
                              boxShadow: '0 4px 12px rgba(197, 160, 89, 0.3)',
                            }}
                          >
                            📅 Book Next Available Window ({unavail.next_available_date})
                          </button>
                        )}

                        {unavail?.reason === 'EXCEEDS_CAPACITY' && (
                          <button
                            onClick={() => handleSearch(checkIn, checkOut, 1)}
                            style={{
                              flex: 1,
                              background: '#0f172a',
                              color: '#ffffff',
                              border: 'none',
                              borderRadius: '8px',
                              padding: '12px 18px',
                              fontWeight: 700,
                              fontSize: '0.86rem',
                              cursor: 'pointer',
                            }}
                          >
                            👤 Adjust Search to 1 Guest & Book
                          </button>
                        )}

                        <button
                          onClick={() => setSelectedRoomType('all')}
                          style={{
                            background: '#ffffff',
                            color: '#0f172a',
                            border: '1px solid #cbd5e1',
                            borderRadius: '8px',
                            padding: '12px 16px',
                            fontWeight: 700,
                            fontSize: '0.86rem',
                            cursor: 'pointer',
                          }}
                        >
                          View Open Suites ({rooms.length})
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* When "All Accommodations" is selected and there are unavailable suites: Show Them Below with Context */}
        {selectedRoomType === 'all' && unavailableRooms.length > 0 && (
          <div style={{ marginTop: '3.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                  Other Grand Horizon Suites (Unavailable for Selected Dates)
                </h3>
                <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '4px 0 0' }}>
                  These accommodations have conflicting bookings, maintenance, or guest count limits
                </p>
              </div>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748b' }}>
                {unavailableRooms.length} {unavailableRooms.length === 1 ? 'suite' : 'suites'} unavailable
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))', gap: '20px' }}>
              {unavailableRooms.map((ur) => {
                const meta = getRoomMeta(ur.room_id);

                return (
                  <div
                    key={ur.room_id}
                    style={{
                      background: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '14px',
                      overflow: 'hidden',
                      boxShadow: '0 4px 14px rgba(0, 0, 0, 0.04)',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      opacity: 0.95,
                    }}
                  >
                    <div>
                      <div style={{ position: 'relative', height: '170px' }}>
                        <img
                          src={meta.imageUrl}
                          alt={ur.name}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                        <span
                          style={{
                            position: 'absolute',
                            top: '10px',
                            right: '10px',
                            background:
                              ur.reason === 'ALREADY_BOOKED'
                                ? '#dc2626'
                                : ur.reason === 'EXCEEDS_CAPACITY'
                                ? '#d97706'
                                : '#475569',
                            color: '#ffffff',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            fontWeight: 800,
                            fontSize: '0.68rem',
                            letterSpacing: '0.5px',
                          }}
                        >
                          {ur.reason === 'ALREADY_BOOKED'
                            ? 'RESERVED'
                            : ur.reason === 'EXCEEDS_CAPACITY'
                            ? `MAX ${ur.capacity} GUEST`
                            : 'MAINTENANCE'}
                        </span>
                      </div>

                      <div style={{ padding: '16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                          <h4 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: '#0f172a' }}>
                            {ur.name}
                          </h4>
                          <span style={{ fontWeight: 700, color: '#64748b', fontSize: '0.85rem' }}>
                            {ur.price_per_night_formatted}/night
                          </span>
                        </div>

                        <p style={{ margin: '8px 0 12px', fontSize: '0.78rem', color: '#64748b', lineHeight: 1.45 }}>
                          {ur.reason_message}
                        </p>

                        {ur.next_available_date && (
                          <div
                            style={{
                              background: '#fef3c7',
                              color: '#92400e',
                              padding: '6px 10px',
                              borderRadius: '6px',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              marginBottom: '8px',
                            }}
                          >
                            <span>📅</span>
                            <span>Next Available: {ur.next_available_date}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div style={{ padding: '0 16px 16px' }}>
                      {ur.reason === 'ALREADY_BOOKED' && ur.next_available_date ? (
                        <button
                          onClick={() => {
                            const nextIn = ur.next_available_date!;
                            const nextOutDate = new Date(nextIn);
                            nextOutDate.setDate(nextOutDate.getDate() + 4);
                            const nextOut = nextOutDate.toISOString().split('T')[0] ?? '';
                            handleSearch(nextIn, nextOut, guests);
                          }}
                          style={{
                            width: '100%',
                            background: '#0f172a',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '8px',
                            padding: '9px 12px',
                            fontWeight: 700,
                            fontSize: '0.8rem',
                            cursor: 'pointer',
                          }}
                        >
                          View From {ur.next_available_date}
                        </button>
                      ) : ur.reason === 'EXCEEDS_CAPACITY' ? (
                        <button
                          onClick={() => handleSearch(checkIn, checkOut, 1)}
                          style={{
                            width: '100%',
                            background: '#0f172a',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '8px',
                            padding: '9px 12px',
                            fontWeight: 700,
                            fontSize: '0.8rem',
                            cursor: 'pointer',
                          }}
                        >
                          Switch to 1 Guest
                        </button>
                      ) : (
                        <button
                          disabled
                          style={{
                            width: '100%',
                            background: '#f1f5f9',
                            color: '#94a3b8',
                            border: '1px solid #e2e8f0',
                            borderRadius: '8px',
                            padding: '9px 12px',
                            fontWeight: 600,
                            fontSize: '0.8rem',
                            cursor: 'not-allowed',
                          }}
                        >
                          Currently Under Renovation
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>

      {/* Booking Checkout Modal */}
      {selectedRoom && (
        <BookingModal
          room={selectedRoom}
          checkIn={checkIn}
          checkOut={checkOut}
          guests={guests}
          nights={nights}
          onClose={() => setSelectedRoom(null)}
          onSuccess={handleBookingSuccess}
        />
      )}

      {/* Confirmation Success Modal */}
      {bookingConfirmation && (
        <ConfirmationModal
          confirmation={bookingConfirmation}
          onClose={() => setBookingConfirmation(null)}
        />
      )}

      {/* Floating Gemini AI Concierge MCP Chatbot */}
      <ChatWidget onBookingConfirmed={() => handleSearch(checkIn, checkOut, guests)} />
    </div>
  );
}
