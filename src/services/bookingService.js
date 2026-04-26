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
  // the standard inter-session buffer, and creates the chain atomically
  // (rolling back any partials on failure).
  createBulkBookings: async (sessionsPayload) => {
    try {
      const response = await api.post('/api/bookings/bulk', sessionsPayload);
      return response.data;
    } catch (error) {
      throw error.response?.data?.message || 'Error creating back-to-back bookings';
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