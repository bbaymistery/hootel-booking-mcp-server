import React, { useState, useRef, useEffect } from 'react';
import type { ChatMessage, ChatTurn, ChatApiResponse } from '../types/api.ts';
import { sendChatMessage, ApiClientError } from '../api/client.ts';

interface ChatWidgetProps {
  onBookingConfirmed?: () => void;
}

function renderFormattedContent(text: string, isUser: boolean): React.ReactNode {
  if (isUser) {
    return text;
  }

  // Helper for inline parts (bold, email badges, bkg badges)
  const formatInlineText = (str: string, keyPrefix: string): React.ReactNode[] => {
    const boldParts = str.split(/(\*\*.*?\*\*)/g);
    return boldParts.map((boldPart, bIdx) => {
      const isBold = boldPart.startsWith('**') && boldPart.endsWith('**');
      const innerText = isBold ? boldPart.slice(2, -2) : boldPart;

      const tokenParts = innerText.split(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}|bkg_[a-zA-Z0-9_]+)/g);

      const renderedTokens = tokenParts.map((token, tIdx) => {
        const subKey = `${keyPrefix}_b${bIdx}_t${tIdx}`;
        if (token.match(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/)) {
          return (
            <span
              key={subKey}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px',
                background: '#e0f2fe',
                color: '#0284c7',
                padding: '2px 8px',
                borderRadius: '6px',
                fontWeight: 700,
                fontSize: '0.86rem',
                border: '1px solid #bae6fd',
                boxShadow: '0 1px 3px rgba(2, 132, 199, 0.15)',
                margin: '0 2px',
              }}
            >
              <span>📧</span>
              <span>{token}</span>
            </span>
          );
        }
        if (token.match(/^bkg_[a-zA-Z0-9_]+$/)) {
          return (
            <code
              key={subKey}
              style={{
                background: '#fef3c7',
                color: '#92400e',
                fontWeight: 800,
                fontSize: '0.88rem',
                padding: '2px 7px',
                borderRadius: '5px',
                border: '1px solid #fde68a',
                fontFamily: 'monospace',
                margin: '0 2px',
              }}
            >
              {token}
            </code>
          );
        }
        return token;
      });

      if (isBold) {
        return (
          <strong key={`${keyPrefix}_b${bIdx}`} style={{ fontWeight: 700, color: '#0f172a' }}>
            {renderedTokens}
          </strong>
        );
      }
      return <React.Fragment key={`${keyPrefix}_b${bIdx}`}>{renderedTokens}</React.Fragment>;
    });
  };

  const lines = text.split('\n');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
      {lines.map((line, lineIdx) => {
        const trimmed = line.trim();
        if (!trimmed) {
          return <div key={lineIdx} style={{ height: '4px' }} />;
        }

        // Bullet item detection (* or -)
        if (trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
          const content = trimmed.slice(2);
          return (
            <div
              key={lineIdx}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
                paddingLeft: '4px',
                marginTop: '1px',
                marginBottom: '1px',
              }}
            >
              <span style={{ color: '#c5a059', fontWeight: 800, fontSize: '0.9rem', lineHeight: '1.4' }}>
                •
              </span>
              <div style={{ flex: 1, lineHeight: '1.45' }}>
                {formatInlineText(content, `l_${lineIdx}`)}
              </div>
            </div>
          );
        }

        return (
          <div key={lineIdx} style={{ lineHeight: '1.45' }}>
            {formatInlineText(line, `l_${lineIdx}`)}
          </div>
        );
      })}
    </div>
  );
}

export function ChatWidget({ onBookingConfirmed }: ChatWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [history, setHistory] = useState<ChatTurn[]>([]);

  // Interactive Quick Date & Guest Picker State
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const defaultIn = tomorrow.toISOString().split('T')[0] ?? '2026-12-10';

  const defaultOutDate = new Date(tomorrow);
  defaultOutDate.setDate(defaultOutDate.getDate() + 5);
  const defaultOut = defaultOutDate.toISOString().split('T')[0] ?? '2026-12-15';

  const [pickerCheckIn, setPickerCheckIn] = useState(defaultIn);
  const [pickerCheckOut, setPickerCheckOut] = useState(defaultOut);
  const [pickerGuests, setPickerGuests] = useState(2);
  const [showDatePicker, setShowDatePicker] = useState(true);
  const [selectedModel, setSelectedModel] = useState<string>('gemini-3.8-flash');

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'model',
      text: 'Greetings and welcome to Grand Horizon Resort & Spa. I am your personal AI Concierge, directly connected to our hotel management system.\n\nHow may I assist you today? I can check real room availability, share hotel services, and arrange your confirmed reservation.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  const handleSend = async (messageText?: string) => {
    const textToSend = (messageText ?? input).trim();
    if (!textToSend || isLoading) return;

    const userMessageId = `user_${Date.now()}`;
    const userMessage: ChatMessage = {
      id: userMessageId,
      role: 'user',
      text: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response: ChatApiResponse = await sendChatMessage(textToSend, history, selectedModel);

      const assistantMessage: ChatMessage = {
        id: `model_${Date.now()}`,
        role: 'model',
        text: response.reply,
        toolCalls: response.toolCalls,
        booking: response.booking,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, assistantMessage]);
      setHistory(response.history);

      if (response.booking && onBookingConfirmed) {
        onBookingConfirmed();
      }
    } catch (err: unknown) {
      let errorText = 'Unable to communicate with the concierge service. Please check server connectivity.';
      if (err instanceof ApiClientError) {
        if (
          err.statusCode === 429 ||
          err.message?.includes('429') ||
          err.message?.includes('quota') ||
          err.message?.includes('RESOURCE_EXHAUSTED')
        ) {
          errorText = `⚠️ **Daily Quota Limit Reached on ${selectedModel}**\n\nGoogle's free daily quota for \`${selectedModel}\` has been reached.\n\n👉 **Please switch to another model** (such as **Gemini 3.8 Flash** or **Gemini 3.6 Flash**) using the Model Selector above and try again!`;
        } else {
          errorText = `Error: ${err.message}`;
        }
      }

      const errorMessage: ChatMessage = {
        id: `err_${Date.now()}`,
        role: 'model',
        text: errorText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 100 }}>
      {/* Launcher Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
            color: '#ffffff',
            border: '2px solid #c5a059',
            borderRadius: '9999px',
            padding: '12px 20px',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3)',
            cursor: 'pointer',
            fontSize: '0.95rem',
            fontWeight: 600,
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-2px)')}
          onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
        >
          <span style={{ fontSize: '1.25rem' }}>✨</span>
          <span>AI Concierge</span>
          <span
            style={{
              width: '8px',
              height: '8px',
              backgroundColor: '#10b981',
              borderRadius: '50%',
              display: 'inline-block',
              boxShadow: '0 0 8px #10b981',
            }}
          />
        </button>
      )}

      {/* Floating Chat Modal */}
      {isOpen && (
        <div
          style={{
            width: '420px',
            height: '620px',
            maxWidth: 'calc(100vw - 32px)',
            maxHeight: 'calc(100vh - 48px)',
            background: '#ffffff',
            borderRadius: '16px',
            boxShadow: '0 20px 40px -10px rgba(15, 23, 42, 0.35)',
            border: '1px solid #e2e8f0',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            animation: 'fadeInUp 0.25s ease-out',
          }}
        >
          {/* Header */}
          <div
            style={{
              background: '#0f172a',
              color: '#ffffff',
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '2px solid #c5a059',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #c5a059, #b38f46)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.1rem',
                  color: '#ffffff',
                }}
              >
                🏨
              </div>
              <div>
                <h3
                  style={{
                    margin: 0,
                    fontSize: '1rem',
                    fontWeight: 700,
                    fontFamily: 'var(--font-serif)',
                    letterSpacing: '0.02em',
                  }}
                >
                  Grand Horizon Concierge
                </h3>
                <span
                  style={{
                    fontSize: '0.72rem',
                    color: '#94a3b8',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <span
                    style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      background: '#10b981',
                      display: 'inline-block',
                    }}
                  />
                  Live MCP Server • Gemini AI
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => {
                  setMessages([
                    {
                      id: 'welcome',
                      role: 'model',
                      text: 'Conversation reset. How may I assist you with your hotel stay today?',
                      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    },
                  ]);
                  setHistory([]);
                }}
                title="Reset Conversation"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  fontSize: '0.8rem',
                }}
              >
                🔄
              </button>
              <button
                onClick={() => setIsOpen(false)}
                title="Close Concierge"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#ffffff',
                  cursor: 'pointer',
                  fontSize: '1.2rem',
                  lineHeight: 1,
                  padding: '4px',
                }}
              >
                ✕
              </button>
            </div>
          </div>

          {/* VS Code Style Gemini Model Selector Bar */}
          <div
            style={{
              background: '#1e293b',
              borderBottom: '1px solid #334155',
              padding: '6px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '0.82rem' }}>🧠</span>
              <span
                style={{
                  fontSize: '0.68rem',
                  color: '#94a3b8',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}
              >
                Model:
              </span>
            </div>

            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              title="Select Gemini AI Model"
              style={{
                flex: 1,
                maxWidth: '260px',
                background: '#0f172a',
                color: '#f8fafc',
                border: '1px solid #475569',
                borderRadius: '6px',
                padding: '4px 8px',
                fontSize: '0.74rem',
                fontWeight: 600,
                outline: 'none',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              <option value="gemini-3.8-flash">⚡ Gemini 3.8 Flash (Active / Recommended)</option>
              <option value="gemini-3.6-flash">⚡ Gemini 3.6 Flash</option>
              <option value="gemini-3.5-flash">⚡ Gemini 3.5 Flash</option>
              <option value="gemini-flash-latest">⚡ Gemini Flash Latest</option>
              <option value="gemini-3.5-flash-lite">⚡ Gemini 3.5 Flash-Lite</option>
              <option value="gemini-flash-lite-latest">⚡ Gemini Flash-Lite Latest</option>
              <option value="gemini-3-flash-preview">⚠️ Gemini 3 Flash Preview (Quota Cap 20/day)</option>
            </select>
          </div>

          {/* Redesigned Quick Date Assistant (No horizontal scrollbars, elegant compact card) */}
          {showDatePicker && (
            <div
              style={{
                background: '#ffffff',
                borderBottom: '1px solid #e2e8f0',
                padding: '12px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                boxShadow: '0 2px 4px rgba(15, 23, 42, 0.04)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '0.95rem' }}>📅</span>
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0f172a' }}>
                    Quick Date & Room Search
                  </span>
                </div>
                <button
                  onClick={() => setShowDatePicker(false)}
                  title="Hide"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#94a3b8',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                    padding: '2px 4px',
                  }}
                >
                  Hide ✕
                </button>
              </div>

              {/* 3-Column Input Grid (Check-in, Check-out, Guests) */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 0.85fr',
                  gap: '8px',
                }}
              >
                <div>
                  <label
                    style={{
                      fontSize: '0.65rem',
                      fontWeight: 700,
                      color: '#64748b',
                      textTransform: 'uppercase',
                      display: 'block',
                      marginBottom: '3px',
                    }}
                  >
                    Check-in
                  </label>
                  <input
                    type="date"
                    value={pickerCheckIn}
                    onChange={(e) => setPickerCheckIn(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '5px 4px',
                      fontSize: '0.74rem',
                      border: '1px solid #cbd5e1',
                      borderRadius: '6px',
                      background: '#f8fafc',
                      color: '#0f172a',
                      outline: 'none',
                      fontFamily: 'inherit',
                    }}
                  />
                </div>

                <div>
                  <label
                    style={{
                      fontSize: '0.65rem',
                      fontWeight: 700,
                      color: '#64748b',
                      textTransform: 'uppercase',
                      display: 'block',
                      marginBottom: '3px',
                    }}
                  >
                    Check-out
                  </label>
                  <input
                    type="date"
                    value={pickerCheckOut}
                    onChange={(e) => setPickerCheckOut(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '5px 4px',
                      fontSize: '0.74rem',
                      border: '1px solid #cbd5e1',
                      borderRadius: '6px',
                      background: '#f8fafc',
                      color: '#0f172a',
                      outline: 'none',
                      fontFamily: 'inherit',
                    }}
                  />
                </div>

                <div>
                  <label
                    style={{
                      fontSize: '0.65rem',
                      fontWeight: 700,
                      color: '#64748b',
                      textTransform: 'uppercase',
                      display: 'block',
                      marginBottom: '3px',
                    }}
                  >
                    Guests
                  </label>
                  <select
                    value={pickerGuests}
                    onChange={(e) => setPickerGuests(Number(e.target.value))}
                    style={{
                      width: '100%',
                      padding: '5px 4px',
                      fontSize: '0.74rem',
                      border: '1px solid #cbd5e1',
                      borderRadius: '6px',
                      background: '#f8fafc',
                      color: '#0f172a',
                      outline: 'none',
                      fontFamily: 'inherit',
                      cursor: 'pointer',
                    }}
                  >
                    <option value={1}>1 Guest</option>
                    <option value={2}>2 Guests</option>
                    <option value={3}>3 Guests</option>
                    <option value={4}>4 Guests</option>
                    <option value={5}>5 Guests</option>
                    <option value={6}>6 Guests</option>
                  </select>
                </div>
              </div>

              {/* Action Buttons Row */}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  onClick={() => {
                    if (!pickerCheckIn || !pickerCheckOut) return;
                    handleSend(`Find available rooms for ${pickerGuests} guests from ${pickerCheckIn} to ${pickerCheckOut}`);
                  }}
                  disabled={isLoading}
                  style={{
                    flex: 1,
                    background: 'linear-gradient(135deg, #c5a059 0%, #b38f46 100%)',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '7px',
                    padding: '8px 12px',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    cursor: isLoading ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    boxShadow: '0 2px 4px rgba(197, 160, 89, 0.25)',
                    transition: 'opacity 0.15s ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.92')}
                  onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
                >
                  <span>🔍</span>
                  <span>Check Rooms & Pricing</span>
                </button>

                <button
                  onClick={() => handleSend("Tell me about Grand Horizon Resort hotel services, dining options, and spa facilities.")}
                  disabled={isLoading}
                  title="Hotel Services"
                  style={{
                    background: '#f1f5f9',
                    color: '#334155',
                    border: '1px solid #cbd5e1',
                    borderRadius: '7px',
                    padding: '8px 10px',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    cursor: isLoading ? 'not-allowed' : 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  ✨ Hotel Services
                </button>
              </div>
            </div>
          )}

          {/* Collapsed Bar (When hidden, offers quick toggle to reopen) */}
          {!showDatePicker && (
            <div
              style={{
                background: '#f8fafc',
                padding: '6px 16px',
                borderBottom: '1px solid #e2e8f0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span style={{ fontSize: '0.74rem', color: '#64748b' }}>
                {pickerCheckIn} → {pickerCheckOut} ({pickerGuests} {pickerGuests === 1 ? 'guest' : 'guests'})
              </span>
              <button
                onClick={() => setShowDatePicker(true)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#c5a059',
                  fontWeight: 700,
                  fontSize: '0.74rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                📅 Change Dates
              </button>
            </div>
          )}

          {/* Message List */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
              background: '#f8fafc',
            }}
          >
            {messages.map((msg) => (
              <div
                key={msg.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                }}
              >
                {/* Discrete Verification Badges (check_availability hidden per user request) */}
                {msg.toolCalls &&
                  msg.toolCalls.filter((tc) => tc.name !== 'check_availability').length > 0 && (
                    <div style={{ marginBottom: '6px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {msg.toolCalls
                        .filter((tc) => tc.name !== 'check_availability')
                        .map((tc, idx) => {
                          const label =
                            tc.name === 'book_room'
                              ? 'Official Reservation Confirmed via Hotel Management System'
                              : 'Live Hotel System Verified';
                          const icon = tc.name === 'book_room' ? '✅' : '⚡';

                          return (
                            <div
                              key={idx}
                              style={{
                                fontSize: '0.73rem',
                                background: tc.isError ? '#fef2f2' : '#f0fdf4',
                                color: tc.isError ? '#991b1b' : '#166534',
                                border: `1px solid ${tc.isError ? '#fecaca' : '#bbf7d0'}`,
                                borderRadius: '6px',
                                padding: '3px 9px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                fontWeight: 600,
                              }}
                            >
                              <span>{tc.isError ? '⚠️' : icon}</span>
                              <span>{tc.isError ? `Booking Conflict: ${tc.name}` : label}</span>
                            </div>
                          );
                        })}
                    </div>
                  )}

                {/* Message Bubble */}
                <div
                  style={{
                    maxWidth: '85%',
                    padding: '12px 16px',
                    borderRadius: '12px',
                    background: msg.role === 'user' ? '#0f172a' : '#ffffff',
                    color: msg.role === 'user' ? '#ffffff' : '#1e293b',
                    boxShadow:
                      msg.role === 'user'
                        ? '0 2px 4px rgba(15, 23, 42, 0.2)'
                        : '0 2px 8px rgba(0, 0, 0, 0.06)',
                    border: msg.role === 'user' ? 'none' : '1px solid #e2e8f0',
                    fontSize: '0.9rem',
                    lineHeight: '1.45',
                    wordBreak: 'break-word',
                  }}
                >
                  {renderFormattedContent(msg.text, msg.role === 'user')}

                  {/* Confirmed Booking Voucher inside Assistant Bubble */}
                  {msg.booking && (
                    <div
                      style={{
                        marginTop: '14px',
                        background: 'linear-gradient(135deg, #fdfcf9 0%, #f7f3ec 100%)',
                        border: '1.5px solid #c5a059',
                        borderRadius: '12px',
                        boxShadow: '0 4px 15px rgba(197, 160, 89, 0.18)',
                        overflow: 'hidden',
                        color: '#0f172a',
                      }}
                    >
                      {/* Voucher Header */}
                      <div
                        style={{
                          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
                          color: '#ffffff',
                          padding: '10px 14px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          borderBottom: '2px solid #c5a059',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '1.1rem' }}>🏨</span>
                          <span style={{ fontWeight: 700, fontSize: '0.82rem', letterSpacing: '0.5px', color: '#f1f5f9' }}>
                            GRAND HORIZON RESORT VOUCHER
                          </span>
                        </div>
                        <span
                          style={{
                            background: 'linear-gradient(135deg, #15803d 0%, #166534 100%)',
                            color: '#ffffff',
                            padding: '3px 8px',
                            borderRadius: '9999px',
                            fontSize: '0.68rem',
                            fontWeight: 800,
                            letterSpacing: '0.5px',
                            boxShadow: '0 2px 6px rgba(22, 101, 52, 0.3)',
                          }}
                        >
                          CONFIRMED
                        </span>
                      </div>

                      {/* Voucher Content */}
                      <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '0.82rem' }}>
                        {/* Reference ID Pill */}
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            background: '#ffffff',
                            padding: '8px 12px',
                            borderRadius: '8px',
                            border: '1px dashed #c5a059',
                          }}
                        >
                          <span style={{ color: '#64748b', fontWeight: 600, fontSize: '0.74rem', textTransform: 'uppercase' }}>
                            Booking Reference
                          </span>
                          <code
                            style={{
                              background: '#fef3c7',
                              color: '#92400e',
                              fontWeight: 800,
                              fontSize: '0.88rem',
                              padding: '3px 8px',
                              borderRadius: '6px',
                              letterSpacing: '0.5px',
                              fontFamily: 'monospace',
                              border: '1px solid #fde68a',
                            }}
                          >
                            {String(msg.booking.booking_id)}
                          </code>
                        </div>

                        {/* Grid: Room & Total */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '8px' }}>
                          <div style={{ background: '#ffffff', padding: '8px 10px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                            <div style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Reserved Room</div>
                            <div style={{ fontWeight: 700, color: '#0f172a', marginTop: '2px', fontSize: '0.84rem' }}>
                              {String((msg.booking as any).room?.name ?? 'Standard Room')}
                            </div>
                          </div>

                          <div style={{ background: '#ffffff', padding: '8px 10px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                            <div style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Total Amount</div>
                            <div style={{ fontWeight: 800, color: '#15803d', marginTop: '2px', fontSize: '0.92rem' }}>
                              {String((msg.booking as any).booking_dates?.total_price_formatted ?? '$' + ((msg.booking as any).total_price_cents ?? 0) / 100)}
                            </div>
                          </div>
                        </div>

                        {/* Detailed Table Rows */}
                        <div
                          style={{
                            background: '#ffffff',
                            padding: '10px 12px',
                            borderRadius: '8px',
                            border: '1px solid #e2e8f0',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '6px',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ color: '#64748b', fontSize: '0.74rem' }}>Dates:</span>
                            <span style={{ fontWeight: 600, color: '#0f172a' }}>
                              {String((msg.booking as any).booking_dates?.check_in)} → {String((msg.booking as any).booking_dates?.check_out)}
                              {' '}({String((msg.booking as any).booking_dates?.nights)} nights)
                            </span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ color: '#64748b', fontSize: '0.74rem' }}>Guest Name:</span>
                            <span style={{ fontWeight: 600, color: '#0f172a' }}>
                              {String((msg.booking as any).customer?.name)}
                            </span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ color: '#64748b', fontSize: '0.74rem' }}>Confirmation Sent:</span>
                            <span
                              style={{
                                background: '#e0f2fe',
                                color: '#0284c7',
                                padding: '2px 8px',
                                borderRadius: '4px',
                                fontWeight: 700,
                                fontSize: '0.74rem',
                                border: '1px solid #bae6fd',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                              }}
                            >
                              <span>📧</span>
                              <span>{String((msg.booking as any).customer?.email)}</span>
                            </span>
                          </div>
                        </div>

                        <div style={{ textAlign: 'center', fontSize: '0.68rem', color: '#94a3b8', fontStyle: 'italic', marginTop: '2px' }}>
                          Official confirmed booking recorded in Neon PostgreSQL
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Timestamp */}
                <span
                  style={{
                    fontSize: '0.68rem',
                    color: '#94a3b8',
                    marginTop: '3px',
                    marginRight: msg.role === 'user' ? '4px' : '0',
                    marginLeft: msg.role === 'model' ? '4px' : '0',
                  }}
                >
                  {msg.timestamp}
                </span>
              </div>
            ))}

            {/* Loading Indicator */}
            {isLoading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px' }}>
                <span style={{ fontSize: '1.2rem', animation: 'spin 1s infinite linear' }}>⏳</span>
                <span style={{ fontSize: '0.85rem', color: '#64748b', fontStyle: 'italic' }}>
                  Concierge is consulting Hotel MCP Server...
                </span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div
            style={{
              padding: '12px 16px',
              background: '#ffffff',
              borderTop: '1px solid #e2e8f0',
              display: 'flex',
              gap: '8px',
              alignItems: 'center',
            }}
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about rooms or book your stay..."
              disabled={isLoading}
              style={{
                flex: 1,
                padding: '10px 14px',
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                fontSize: '0.9rem',
                outline: 'none',
                fontFamily: 'inherit',
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = '#c5a059')}
              onBlur={(e) => (e.currentTarget.style.borderColor = '#cbd5e1')}
            />

            <button
              onClick={() => handleSend()}
              disabled={isLoading || !input.trim()}
              style={{
                background: input.trim() && !isLoading ? '#0f172a' : '#cbd5e1',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                padding: '10px 16px',
                cursor: input.trim() && !isLoading ? 'pointer' : 'not-allowed',
                fontWeight: 600,
                fontSize: '0.9rem',
                transition: 'background 0.2s ease',
              }}
            >
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
