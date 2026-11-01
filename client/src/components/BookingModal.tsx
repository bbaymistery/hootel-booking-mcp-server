import React, { useState } from 'react';
import type { AvailableRoom, Room, BookingConfirmation } from '../types/api.ts';
import { createBooking, ApiClientError } from '../api/client.ts';

interface BookingModalProps {
  room: AvailableRoom | Room;
  checkIn: string;
  checkOut: string;
  guests: number;
  nights: number;
  onClose: () => void;
  onSuccess: (confirmation: BookingConfirmation) => void;
}

export const BookingModal: React.FC<BookingModalProps> = ({
  room,
  checkIn,
  checkOut,
  guests,
  nights,
  onClose,
  onSuccess
}) => {
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Generate a persistent idempotency key for this checkout attempt to safely handle retries
  const [idempotencyKey] = useState(() => `web_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`);

  const roomId = 'room_id' in room ? room.room_id : room.id;
  const totalPriceFormatted =
    'total_price_formatted' in room
      ? room.total_price_formatted
      : `$${((room.price_per_night_cents * nights) / 100).toFixed(2)} USD`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const confirmation = await createBooking(
        {
          room_id: roomId,
          customer_name: customerName,
          customer_email: customerEmail,
          check_in: checkIn,
          check_out: checkOut,
          guests
        },
        idempotencyKey
      );

      onSuccess(confirmation);
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to reserve room. Please check your network and try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Complete Reservation</h2>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close modal">
            &times;
          </button>
        </div>

        <div className="modal-body">
          {errorMessage && (
            <div className="alert-banner alert-error">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="booking-summary-box">
            <div className="summary-row">
              <span style={{ color: 'var(--text-muted)' }}>Room Selected:</span>
              <strong style={{ color: 'var(--primary)' }}>{room.name}</strong>
            </div>
            <div className="summary-row">
              <span style={{ color: 'var(--text-muted)' }}>Stay Dates:</span>
              <span>{checkIn} to {checkOut} ({nights} {nights === 1 ? 'night' : 'nights'})</span>
            </div>
            <div className="summary-row">
              <span style={{ color: 'var(--text-muted)' }}>Guests:</span>
              <span>{guests} {guests === 1 ? 'Guest' : 'Guests'}</span>
            </div>
            <div className="summary-row">
              <span style={{ color: 'var(--text-muted)' }}>Rate per Night:</span>
              <span>{room.price_per_night_formatted}</span>
            </div>
            <div className="summary-row summary-total">
              <span>Total Price (USD):</span>
              <span>{totalPriceFormatted}</span>
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="form-group" style={{ marginBottom: '1.25rem' }}>
              <label className="form-label">Full Name</label>
              <input
                type="text"
                className="form-input"
                placeholder="Jane Doe"
                required
                minLength={2}
                maxLength={100}
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              />
            </div>

            <div className="form-group" style={{ marginBottom: '1.75rem' }}>
              <label className="form-label">Email Address</label>
              <input
                type="email"
                className="form-input"
                placeholder="jane.doe@example.com"
                required
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn-primary"
                style={{ backgroundColor: '#f1f5f9', color: '#475569' }}
                onClick={onClose}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={isSubmitting}>
                {isSubmitting ? 'Confirming...' : 'Confirm & Reserve'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
