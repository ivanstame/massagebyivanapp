import React, { useState, useCallback, useRef, useEffect } from 'react';
import { GoogleMap, useJsApiLoader, Marker } from '@react-google-maps/api';
import { MapPin, Crosshair, Loader } from 'lucide-react';
import api from '../services/api';

const MAP_CONTAINER_STYLE = {
  width: '100%',
  height: '300px',
  borderRadius: '0.5rem'
};

// Default center: Huntington Beach, CA
const DEFAULT_CENTER = { lat: 33.6603, lng: -117.9992 };

const PinDropMap = ({ onLocationConfirmed, initialLocation }) => {
  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: process.env.REACT_APP_GOOGLE_MAPS_API_KEY
  });

  const [markerPosition, setMarkerPosition] = useState(
    initialLocation ? { lat: initialLocation.lat, lng: initialLocation.lng } : null
  );
  const [address, setAddress] = useState(initialLocation?.address || '');
  const [reverseGeocoding, setReverseGeocoding] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState(null);
  const mapRef = useRef(null);

  const onMapLoad = useCallback((map) => {
    mapRef.current = map;
  }, []);

  // Reverse geocode a position
  const reverseGeocode = useCallback(async (lat, lng) => {
    setReverseGeocoding(true);
    setError(null);
    try {
      const res = await api.get('/api/geocode/reverse', {
        params: { lat, lng }
      });
      setAddress(res.data.address);
      return res.data.address;
    } catch (err) {
      console.error('Reverse geocode failed:', err);
      setAddress(`${lat.toFixed(6)}, ${lng.toFixed(6)}`);
      return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    } finally {
      setReverseGeocoding(false);
    }
  }, []);

  // Handle map click — drop/move pin
  const handleMapClick = useCallback(async (event) => {
    const lat = event.latLng.lat();
    const lng = event.latLng.lng();
    setMarkerPosition({ lat, lng });
    await reverseGeocode(lat, lng);
  }, [reverseGeocode]);

  // Handle marker drag end
  const handleMarkerDragEnd = useCallback(async (event) => {
    const lat = event.latLng.lat();
    const lng = event.latLng.lng();
    setMarkerPosition({ lat, lng });
    await reverseGeocode(lat, lng);
  }, [reverseGeocode]);

  // Use device GPS
  const handleUseMyLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser');
      return;
    }

    setLocating(true);
    setError(null);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        setMarkerPosition({ lat, lng });

        if (mapRef.current) {
          mapRef.current.panTo({ lat, lng });
          mapRef.current.setZoom(16);
        }

        await reverseGeocode(lat, lng);
        setLocating(false);
      },
      (err) => {
        console.error('Geolocation error:', err);
        setError('Could not get your location. Please enable location services or drop a pin manually.');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, [reverseGeocode]);

  // Confirm the pinned location
  const handleConfirm = useCallback(() => {
    if (!markerPosition) return;
    onLocationConfirmed({
      lat: markerPosition.lat,
      lng: markerPosition.lng,
      fullAddress: address
    });
  }, [markerPosition, address, onLocationConfirmed]);

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center h-[300px] bg-slate-100 rounded-lg">
        <Loader className="w-6 h-6 text-slate-500 animate-spin" />
        <span className="ml-2 text-slate-500 text-sm">Loading map...</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Use My Location button */}
      <button
        type="button"
        onClick={handleUseMyLocation}
        disabled={locating}
        className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors disabled:opacity-50"
      >
        {locating ? (
          <>
            <Loader className="w-4 h-4 animate-spin" />
            Finding your location...
          </>
        ) : (
          <>
            <Crosshair className="w-4 h-4" />
            Use My Current Location
          </>
        )}
      </button>

      {/* Map */}
      <div className="relative">
        <GoogleMap
          mapContainerStyle={MAP_CONTAINER_STYLE}
          center={markerPosition || DEFAULT_CENTER}
          zoom={markerPosition ? 16 : 12}
          onClick={handleMapClick}
          onLoad={onMapLoad}
          options={{
            streetViewControl: false,
            mapTypeControl: false,
            fullscreenControl: false,
            zoomControl: true,
            gestureHandling: 'greedy'
          }}
        >
          {markerPosition && (
            <Marker
              position={markerPosition}
              draggable={true}
              onDragEnd={handleMarkerDragEnd}
              animation={window.google?.maps?.Animation?.DROP}
            />
          )}
        </GoogleMap>

        {!markerPosition && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="bg-paper-elev/90 backdrop-blur-sm px-4 py-2 rounded-full shadow-md text-sm text-slate-600 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-teal-600" />
              Tap the map to drop a pin
            </div>
          </div>
        )}
      </div>

      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}

      {/* Address display + confirm */}
      {markerPosition && (
        <div className="bg-teal-50 rounded-lg p-4 border border-teal-200">
          <div className="flex items-start gap-3">
            <MapPin className="w-5 h-5 text-teal-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-teal-900">
                {reverseGeocoding ? 'Looking up address...' : 'Pin Location'}
              </p>
              <p className="text-sm text-teal-800 break-words">
                {reverseGeocoding ? '...' : address}
              </p>
              <p className="text-xs text-teal-600 mt-1">
                Drag the pin to adjust
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleConfirm}
            disabled={reverseGeocoding}
            className="w-full mt-3 py-2.5 px-4 bg-teal-600 text-white rounded-lg font-medium hover:bg-cyan-900 transition-colors disabled:bg-slate-400"
          >
            Use This Location
          </button>
        </div>
      )}
    </div>
  );
};

export default PinDropMap;
