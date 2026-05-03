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
  // address. The server cascades times from the first session and
  // creates the chain atomically (rolling back any partials on
  // failure). The intra-session buffer (15 min vs flush) is read from
  // the provider's `sameAddressTurnoverBuffer` profile setting on the
  // server — no per-call override.
  //
  // Throws an Error with .message + (when the server returned them)
  // .alternatives and .chainDurationMin so the booking form can show
  // actionable suggestions instead of a dead-end "doesn't fit" message.
  createBulkBookings: async (sessionsPayload) => {
    try {
      const response = await api.post('/api/bookings/bulk', sessionsPayload);
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