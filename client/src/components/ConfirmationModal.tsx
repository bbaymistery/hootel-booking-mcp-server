import React from 'react';
import type { BookingConfirmation } from '../types/api.ts';

interface ConfirmationModalProps {
  confirmation: BookingConfirmation;
  onClose: () => void;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({ confirmation, onClose }) => {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '580px' }}>
        <div className="modal-header" style={{ backgroundColor: '#064e3b' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
            <h2 className="modal-title" style={{ fontSize: '1.25rem' }}>Reservation Confirmed</h2>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close modal">
            &times;
          </button>
        </div>

        <div className="modal-body">
          <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Booking Reference
            </span>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--primary)', fontFamily: 'monospace', margin: '0.25rem 0' }}>
              {confirmation.booking_id}
            </div>
            {confirmation.is_idempotent_replay && (
              <span style={{ display: 'inline-block', backgroundColor: '#eff6ff', color: '#1d4ed8', fontSize: '0.75rem', padding: '0.2rem 0.6rem', borderRadius: '4px', fontWeight: 500 }}>
                Idempotent Replay Verified
              </span>
            )}
          </div>

          <div className="booking-summary-box" style={{ backgroundColor: '#f8fafc', borderColor: '#e2e8f0' }}>
            <div className="summary-row">
              <span style={{ color: 'var(--text-muted)' }}>Room:</span>
              <strong style={{ color: 'var(--primary)' }}>{confirmation.room.name}</strong>
            </div>
            <div className="summary-row">
              <span style={{ color: 'var(--text-muted)' }}>Primary Guest:</span>
              <span>{confirmation.customer.name} ({confirmation.customer.email})</span>
            </div>
            <div className="summary-row">
              <span style={{ color: 'var(--text-muted)' }}>Stay Dates:</span>
              <span>{confirmation.booking_dates.check_in} to {confirmation.booking_dates.check_out} ({confirmation.booking_dates.nights} nights)</span>
            </div>
            <div className="summary-row">
              <span style={{ color: 'var(--text-muted)' }}>Total Amount Paid:</span>
              <strong style={{ color: 'var(--primary)' }}>{confirmation.booking_dates.total_price_formatted}</strong>
            </div>
            <div className="summary-row">
              <span style={{ color: 'var(--text-muted)' }}>Confirmed At:</span>
              <span style={{ fontSize: '0.8rem', color: '#64748b' }}>{new Date(confirmation.created_at).toLocaleString()}</span>
            </div>
          </div>

          <div style={{ backgroundColor: '#ecfdf5', border: '1px solid rgba(16, 185, 129, 0.2)', padding: '0.85rem 1rem', borderRadius: '8px', fontSize: '0.85rem', color: '#065f46', marginBottom: '1.5rem', display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
              <polyline points="22,6 12,13 2,6"/>
            </svg>
            <span>A confirmation receipt and booking event have been recorded in the database.</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <button
              className="btn-primary"
              style={{ backgroundColor: '#f1f5f9', color: '#334155' }}
              onClick={() => window.print()}
            >
              Print Receipt
            </button>
            <button className="btn-primary" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
