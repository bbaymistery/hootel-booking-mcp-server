import React from 'react';

interface HeaderProps {
  apiStatus: 'connected' | 'connecting' | 'error';
}

export const Header: React.FC<HeaderProps> = ({ apiStatus }) => {
  return (
    <header className="app-header">
      <div className="header-container">
        <div className="brand-wrapper">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent)' }}>
            <path d="M3 21h18"/>
            <path d="M5 21V7l8-4v18"/>
            <path d="M19 21V11l-6-4"/>
            <path d="M9 9h1"/>
            <path d="M9 13h1"/>
            <path d="M9 17h1"/>
          </svg>
          <div>
            <h1 className="brand-title">Grand Horizon</h1>
            <p className="brand-subtitle">Luxury Hotel & MCP AI Suite</p>
          </div>
        </div>

        <div className="mcp-status-pill">
          <span
            className="status-dot"
            style={{
              backgroundColor: apiStatus === 'connected' ? 'var(--success)' : apiStatus === 'connecting' ? '#f59e0b' : 'var(--danger)',
              boxShadow: apiStatus === 'connected' ? '0 0 8px var(--success)' : 'none'
            }}
          />
          <span>{apiStatus === 'connected' ? 'MCP & DB Connected' : apiStatus === 'connecting' ? 'Connecting...' : 'API Offline'}</span>
        </div>
      </div>
    </header>
  );
};
