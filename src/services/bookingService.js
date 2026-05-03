// src/services/bookingService.js
import api from './api';

export const bookingService = {
  createBooking: async (bookingData) => {
    try {
      const response = await api.post('/api/bookings', bookingData);
      return response.data;
    } catch (error) {
      throw error.response?.data?.message || 'Error creating booking';
    }
  },

  // Back-to-back chain: an array of session payloads, all sharing date +
  // address. The server cascades times from the first session, applies
  // the standard inter-session buffer (zero by default for same-address
  // chains; 15 min when opts.forceBuffer is true — couples that need a
  // sheet change between sessions, etc.), and creates the chain
  // atomically (rolling back any partials on failure).
  //
  // Throws an Error with .message + (when the server returned them)
  // .alternatives and .chainDurationMin so the booking form can show
  // actionable suggestions instead of a dead-end "doesn't fit" message.
  createBulkBookings: async (sessionsPayload, opts = {}) => {
    try {
      const body = opts.forceBuffer
        ? { sessions: sessionsPayload, forceBuffer: true }
        : sessionsPayload;
      const response = await api.post('/api/bookings/bulk', body);
      return response.data;
    } catch (error) {
      const data = error.response?.data;
      const err = new Error(data?.message || 'Error creating back-to-back bookings');
      if (data?.alternatives) err.alternatives = data.alternatives;
      if (data?.chainDurationMin) err.chainDurationMin = data.chainDurationMin;
      throw err;
    }
  },

  getBookings: async (date) => {
    try {
      const response = await api.get('/api/bookings', {
        params: { date }
      });
      return response.data;
    } catch (error) {
      throw error.response?.data?.message || 'Error fetching bookings';
    }
  },

  cancelBooking: async (bookingId) => {
    try {
      const response = await api.delete(`/api/bookings/${bookingId}`);
      return response.data;
    } catch (error) {
      throw error.response?.data?.message || 'Error cancelling booking';
    }
  }
};