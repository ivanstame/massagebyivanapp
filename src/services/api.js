// src/services/api.js
import axios from 'axios';

// Use environment variable for API URL or fallback to same origin in production
const baseURL = process.env.REACT_APP_API_URL ||
  (window.location.hostname === 'localhost'
    ? 'http://localhost:5000'
    : window.location.origin);

const api = axios.create({
  baseURL,
  withCredentials: true,
  headers: {
    'Accept': 'application/json',
    'Content-Type': 'application/json'
  }
});

// Log the API configuration
console.log('API Service initialized with baseURL:', baseURL);

// Add request interceptor
api.interceptors.request.use(
  (config) => {
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add response interceptor
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Redirect to login or handle session expiration
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
