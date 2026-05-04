import React, { useState, useEffect, useContext, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AuthContext } from '../AuthContext';
import { bookingService } from '../services/bookingService';
import api from '../services/api';
import { DateTime } from 'luxon';
import { DEFAULT_TZ, TIME_FORMATS } from '../utils/timeConstants';
import LuxonService from '../utils/LuxonService';
import { ArrowLeft, ArrowRight, User as UserIcon, Plus, MapPin } from 'lucide-react';

// Import the new components
import CalendarSection from './BookingFormComponents/CalendarSection';
import RecipientSection from './BookingFormComponents/RecipientSection';
import AddressSection from './BookingFormComponents/AddressSection';
import SimpleDurationSelector from './BookingFormComponents/SimpleDurationSelector';
import AddOnsSelector from './BookingFormComponents/AddOnsSelector';
import BookingSummaryCard from './BookingFormComponents/BookingSummaryCard';
import AvailableTimeSlots from './BookingFormComponents/AvailableTimeSlots';
import BookingConfirmationModal from './BookingFormComponents/BookingConfirmationModal';
import PaymentMethodSelector from './BookingFormComponents/PaymentMethodSelector';
import StripeCheckout from './BookingFormComponents/StripeCheckout';
import ClientPickerModal from './ClientPickerModal';
import AdditionalSessionRow from './BookingFormComponents/AdditionalSessionRow';

// Standard inter-session settle buffer. Mirrors the server-side constant
// in routes/bookings.js so the time cascade computed on the client matches
// what the server schedules.
// Default buffer in MINUTES between sessions when the user is composing
// a back-to-back chain in the booking form. Zero because chain sessions
// share one address — provider stays put, no cleanup-and-drive
// interval to absorb. Mirrors CHAIN_INTRA_BUFFER on the server in
// chainBookingService.js so the preview times the form shows match
// what actually gets created. The component overrides this to 15 when
// the user enables the per-booking "add turnover" toggle (see
// `intraBufferMin` derived inside the component below).
const DEFAULT_INTRA_BUFFER_MIN = 0;

const BookingForm = ({ googleMapsLoaded }) => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useContext(AuthContext);
  const isProviderBooking = user?.accountType === 'PROVIDER';

  // Provider state
  const [provider, setProvider] = useState(null);

  // Target client — when a provider books on behalf of someone. For regular
  // client self-bookings this stays null and the form falls back to `user`.
  const [targetClient, setTargetClient] = useState(null);
  const [targetClientLoading, setTargetClientLoading] = useState(false);
  const [showClientPicker, setShowClientPicker] = useState(false);

  // Provider services (fetched from API)
  const [durationOptions, setDurationOptions] = useState([]);
  const [availableAddons, setAvailableAddons] = useState([]);
  const [acceptedPaymentMethods, setAcceptedPaymentMethods] = useState(['cash']);
  const [venmoHandle, setVenmoHandle] = useState(null);

  // Booking flow state with sensible defaults
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [recipientType, setRecipientType] = useState('self');
  const [recipientInfo, setRecipientInfo] = useState({ name: '', phone: '', email: '' });
  const [fullAddress, setFullAddress] = useState('');
  const [location, setLocation] = useState(null);
  // The day's availability shape — used to short-circuit the address
  // picker when the day is purely in-studio (location is fixed at the
  // studio, asking the client for their address is misleading).
  const [dayBlocks, setDayBlocks] = useState([]);
  const [selectedDuration, setSelectedDuration] = useState(null);
  const [selectedAddons, setSelectedAddons] = useState([]);
  // Identifier stored alongside the booking; name comes from the selected package's label.
  const [selectedServiceType] = useState('package');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('cash');
  // Set when client picks "Use package credit" — sent as packagePurchaseId
  // in the booking payload so the server can atomically reserve the credit.
  const [selectedPackageId, setSelectedPackageId] = useState(null);
  const [redeemablePackages, setRedeemablePackages] = useState([]);
  const [availableSlots, setAvailableSlots] = useState([]);
  const [selectedTime, setSelectedTime] = useState(null);
  // When the chain expands (added session, added addon) and the user's
  // previously-picked time no longer fits the new chain, we auto-clear
  // selectedTime and show this notice so they pick again rather than
  // submit a stale value that will fail at /bulk validation.
  const [staleTimeNotice, setStaleTimeNotice] = useState(null);

  // Back-to-back chain — additional sessions stack onto the first booking.
  // Each entry mirrors a subset of the main form's state; the time
  // cascades automatically (so no per-row time picker). When this is
  // empty (default), the form behaves as a normal single booking.
  const [additionalSessions, setAdditionalSessions] = useState([]);

  // Same-address turnover buffer between sibling chain sessions. The
  // server-side authoritative value lives on the provider's profile
  // (User.providerProfile.sameAddressTurnoverBuffer); the form mirrors
  // it locally only so the chain time-cascade preview matches the
  // server's eventual cascade. Defaults to ON (matches the schema
  // default); the effect below syncs from the loaded provider doc.
  const [providerTurnoverBuffer, setProviderTurnoverBuffer] = useState(true);
  const intraBufferMin = providerTurnoverBuffer ? 15 : DEFAULT_INTRA_BUFFER_MIN;
  // Sync the local mirror from the loaded provider doc. Strict-true
  // check so an explicit false defeats the schema default; undefined/
  // null falls back to ON (the schema default).
  useEffect(() => {
    if (provider?.providerProfile) {
      setProviderTurnoverBuffer(
        provider.providerProfile.sameAddressTurnoverBuffer !== false
      );
    }
  }, [provider?.providerProfile?.sameAddressTurnoverBuffer]);

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [bookingSuccess, setBookingSuccess] = useState(false);
  const [newBookingId, setNewBookingId] = useState(null);
  const [showStripeCheckout, setShowStripeCheckout] = useState(false);
  const [pendingBookingPrice, setPendingBookingPrice] = useState(null);
  // Bumped after a booking succeeds so the calendar re-fetches month
  // dots — a booking might consume the last open slot on a date and
  // the green dot should clear.
  const [calendarRefreshKey, setCalendarRefreshKey] = useState(0);

  // Get provider info and services
  useEffect(() => {
    const fetchProviderInfo = async () => {
      let providerId = null;

      if (user.accountType === 'PROVIDER') {
        setProvider(user);
        providerId = user._id;
      } else if (user.accountType === 'CLIENT' && user.providerId) {
        try {
          const response = await api.get(`/api/users/provider/${user.providerId}`);
          setProvider(response.data || {
            _id: user.providerId,
            providerProfile: { businessName: 'Your Provider' }
          });
          providerId = user.providerId;
        } catch (error) {
          console.error('Error fetching provider info:', error);
          setProvider({
            _id: user.providerId || user._id,
            providerProfile: { businessName: 'Your Provider' }
          });
          providerId = user.providerId;
        }
      }

      // Fetch provider's services (pricing + addons)
      if (providerId) {
        try {
          const servicesRes = await api.get(`/api/users/provider/${providerId}/services`);
          const {
            basePricing,
            addons,
            acceptedPaymentMethods: providerMethods,
            venmoHandle: providerVenmoHandle
          } = servicesRes.data;

          if (providerVenmoHandle) {
            setVenmoHandle(providerVenmoHandle);
          }

          if (providerMethods && providerMethods.length > 0) {
            setAcceptedPaymentMethods(providerMethods);
            setSelectedPaymentMethod(providerMethods[0]);
          }

          if (basePricing && basePricing.length > 0) {
            setDurationOptions(basePricing);
            // Auto-select first package if none selected
            setSelectedDuration(basePricing[0].duration);
          }

          if (addons && addons.length > 0) {
            setAvailableAddons(addons);
          }
        } catch (err) {
          console.error('Error fetching provider services:', err);
        }
      }
    };

    if (user) {
      fetchProviderInfo();
    }
  }, [user]);

  // When a provider books on behalf of a target client, the client's
  // pricing tier may differ from Standard. Re-resolve pricing through
  // the services endpoint with ?clientId= so the form's durationOptions
  // reflect the right tier. The endpoint server-side already handles
  // self-booking clients via req.user — this branch is just for the
  // provider-on-behalf path.
  useEffect(() => {
    if (!provider?._id || !isProviderBooking || !targetClient?._id) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get(
          `/api/users/provider/${provider._id}/services`,
          { params: { clientId: targetClient._id } }
        );
        if (cancelled) return;
        const tieredPricing = res.data?.basePricing;
        if (Array.isArray(tieredPricing) && tieredPricing.length > 0) {
          setDurationOptions(tieredPricing);
        }
      } catch (err) {
        console.error('Failed to resolve client tier pricing:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [provider?._id, isProviderBooking, targetClient?._id]);

  // Load the target client whenever ?clientId= changes (provider booking path).
  // For CLIENT-self bookings this effect is a no-op.
  useEffect(() => {
    if (!isProviderBooking) return;

    const clientId = searchParams.get('clientId');
    if (!clientId) {
      setTargetClient(null);
      setShowClientPicker(true); // force a choice before the provider can book
      return;
    }

    setShowClientPicker(false);
    setTargetClientLoading(true);
    (async () => {
      try {
        const res = await api.get(`/api/users/provider/clients/${clientId}`);
        setTargetClient(res.data);
      } catch (err) {
        console.error('Failed to load target client:', err);
        setError('Could not load the selected client. Pick another.');
        setTargetClient(null);
        setShowClientPicker(true);
      } finally {
        setTargetClientLoading(false);
      }
    })();
  }, [isProviderBooking, searchParams]);

  // When a client is picked inline, swap the URL so reloads land in the same
  // context. Address/preferences reload via the targetClient effect below;
  // date/duration/add-ons already chosen are preserved.
  const handleClientPicked = (client) => {
    setShowClientPicker(false);
    setSelectedTime(null);
    setAvailableSlots([]);
    setSearchParams({ clientId: client._id }, { replace: true });
  };

  // Handle address confirmation
  const handleAddressConfirmed = async (addressData) => {
    setLocation(addressData);
    setFullAddress(addressData.fullAddress);
  };

  // Load the recipient's saved address into form state. For client
  // self-bookings this is user.profile.address; for provider-on-behalf
  // bookings it's the target client's address (the booking defaults to
  // where the recipient is, not the provider). Geocodes through the
  // server's /api/geocode helper so we have lat/lng for slot validation.
  //
  // Extracted into a callable function (vs inline in the mount effect)
  // so the studio-clear branch can fall back to the saved address
  // instead of leaving location null. Returns true if it kicked off a
  // load; false if there was no saved address to load.
  const loadSavedAddress = useCallback(() => {
    const source = isProviderBooking ? targetClient : user;
    if (!source || source.accountType !== 'CLIENT' || !source.profile?.address) {
      return false;
    }
    const addr = source.profile.address;
    const combinedAddress = (addr.street && addr.city && addr.state && addr.zip)
      ? `${addr.street}${addr.unit ? ', ' + addr.unit : ''}, ${addr.city}, ${addr.state} ${addr.zip}`
      : addr.formatted || null;
    if (!combinedAddress) return false;

    setFullAddress(combinedAddress);
    (async () => {
      try {
        const geo = await api.get('/api/geocode', {
          params: { address: combinedAddress },
        });
        setLocation({
          lat: geo.data.lat,
          lng: geo.data.lng,
          fullAddress: combinedAddress,
        });
      } catch (err) {
        console.error('Auto-geocode failed', err);
      }
    })();
    return true;
  }, [user, targetClient, isProviderBooking]);

  useEffect(() => {
    loadSavedAddress();
  }, [loadSavedAddress]);

  // Fetch the client's redeemable packages so the payment-method step can
  // offer "Use package credit" when one matches the selected duration.
  //   - Client booking themselves: /packages/mine (their own packages)
  //   - Provider booking on behalf: /packages/client/:targetClientId
  //     (the target's packages, scoped to this provider on the server)
  useEffect(() => {
    if (!user) {
      setRedeemablePackages([]);
      return;
    }
    if (isProviderBooking && !targetClient?._id) {
      // Provider hasn't picked a client yet — no packages to show.
      setRedeemablePackages([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const url = isProviderBooking
          ? `/api/packages/client/${targetClient._id}`
          : '/api/packages/mine';
        const res = await api.get(url);
        if (cancelled) return;
        // Only show packages that are paid, not cancelled, and have any
        // remaining capacity (sessions OR minutes depending on kind).
        const eligible = (res.data || []).filter(p => {
          if (p.paymentStatus !== 'paid' || p.cancelledAt) return false;
          return p.kind === 'minutes'
            ? (p.minutesRemaining || 0) > 0
            : (p.sessionsRemaining || 0) > 0;
        });
        setRedeemablePackages(eligible);
      } catch (err) {
        // Non-fatal — booking still works without packages.
        console.error('Failed to load packages for booking form:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [user, isProviderBooking, targetClient?._id]);

  // Filter redeemable packages to those that fit the currently-selected
  // duration. Sessions-mode requires an exact duration match; minutes-mode
  // only needs enough remaining minutes in the pool. If the client switches
  // duration after picking a package, we clear the selection so they don't
  // accidentally submit a mismatch (the server would reject it anyway, but
  // front-end clarity matters).
  //
  // Minutes-mode packages with positive but insufficient balance are also
  // included — those qualify for PARTIAL redemption (apply the remaining
  // minutes from the package, pay the rest via cash/card/venmo/zelle).
  // Sessions-mode keeps the strict "duration must match exactly" filter
  // since one session credit is one fixed-duration unit.
  const matchingPackages = redeemablePackages.filter(p => {
    if (p.kind === 'minutes') {
      return (p.minutesRemaining || 0) > 0;
    }
    return p.sessionDuration === selectedDuration;
  });
  const selectedPackage = selectedPackageId
    ? matchingPackages.find(p => p._id === selectedPackageId)
    : null;
  const isPartialRedemption = !!(
    selectedPackage &&
    selectedPackage.kind === 'minutes' &&
    (selectedPackage.minutesRemaining || 0) < selectedDuration
  );
  const packageMinutesApplied = selectedPackage
    ? (isPartialRedemption ? selectedPackage.minutesRemaining : selectedDuration)
    : 0;
  useEffect(() => {
    if (selectedPackageId) {
      const stillValid = matchingPackages.some(p => p._id === selectedPackageId);
      if (!stillValid) {
        setSelectedPackageId(null);
        if (selectedPaymentMethod === 'package') {
          setSelectedPaymentMethod(acceptedPaymentMethods[0] || 'cash');
        }
      }
    }
  }, [selectedDuration, matchingPackages, selectedPackageId, selectedPaymentMethod, acceptedPaymentMethods]);

  // When the selected package is PARTIAL, the user must pick a non-
  // package method to cover the remainder. If they had previously
  // selected 'package' (full), demote to a real method so the form
  // doesn't sit in an invalid state.
  useEffect(() => {
    if (isPartialRedemption && selectedPaymentMethod === 'package') {
      setSelectedPaymentMethod(acceptedPaymentMethods.find(m => m !== 'package') || 'cash');
    }
  }, [isPartialRedemption, selectedPaymentMethod, acceptedPaymentMethods]);

  // Fetch available time slots
  const fetchAvailableSlots = async () => {
    const providerId = user.accountType === 'PROVIDER' ? user._id : user.providerId;
    if (!providerId) return;

    const dateLA = DateTime.fromJSDate(selectedDate).setZone(DEFAULT_TZ);
    const formattedDate = dateLA.toFormat('yyyy-MM-dd');

    // Calculate total duration including add-on extra time. When the user
    // has stacked additional back-to-back sessions, sum the entire chain
    // (per-session duration + per-session addon extra time) plus the
    // standard settle buffer between siblings, so the slot picker only
    // surfaces start times where the whole chain fits.
    const extraTime = selectedAddons.reduce((sum, name) => {
      const addon = availableAddons.find(a => a.name === name);
      return sum + (addon?.extraTime || 0);
    }, 0);
    const firstSessionDuration = selectedDuration + extraTime;

    const additionalDurations = additionalSessions.map(s => {
      const sExtra = (s.addons || []).reduce((sum, name) => {
        const a = availableAddons.find(x => x.name === name);
        return sum + (a?.extraTime || 0);
      }, 0);
      return (s.duration || 0) + sExtra;
    });

    const totalDuration = firstSessionDuration
      + additionalDurations.reduce((acc, d) => acc + d, 0)
      + additionalSessions.length * intraBufferMin;

    try {
      const response = await api.get(`/api/availability/available/${formattedDate}`, {
        params: {
          providerId,
          duration: totalDuration,
          lat: location?.lat,
          lng: location?.lng,
          // No forceBuffer query — the slot picker reads the provider's
          // sameAddressTurnoverBuffer profile setting server-side.
        }
      });
      // Slot endpoint now returns objects: { time, kind, location?, ... }.
      // Filter out slots without enough lead time (60 min from now), then
      // shape into the form state's expected slot model — keeping the
      // mobile/static metadata so downstream rendering can distinguish.
      const cutoff = DateTime.now().setZone(DEFAULT_TZ).plus({ minutes: 60 });
      const slots = (response.data || [])
        .map(s => {
          // Backwards-compat: tolerate the old shape where the endpoint
          // returned bare ISO strings, just in case any caller still
          // hits it that way during a transition.
          if (typeof s === 'string') return { time: s, kind: 'mobile' };
          return s;
        })
        .filter(s => {
          const dt = DateTime.fromISO(s.time, { zone: DEFAULT_TZ });
          return dt > cutoff;
        })
        .map(s => {
          const dt = DateTime.fromISO(s.time, { zone: DEFAULT_TZ });
          return {
            iso: s.time,
            display: dt.toFormat('h:mm a'),
            local: dt.toFormat('HH:mm'),
            kind: s.kind || 'mobile',
            location: s.location || null,
            useMobilePricing: s.useMobilePricing,
            pricing: s.pricing || null,
            bufferMinutes: s.bufferMinutes,
          };
        });
      setAvailableSlots(slots);
    } catch (err) {
      console.error('Error fetching slots:', err);
      setAvailableSlots([]);
    }
  };

  // Re-fetch slots when dependencies change. providerTurnoverBuffer
  // is included so the chain duration sent to the picker matches the
  // server's cascade (with or without the 15-min intra-chain gap).
  useEffect(() => {
    if (fullAddress && selectedDuration && selectedDate && (provider || user?.accountType === 'PROVIDER')) {
      fetchAvailableSlots();
    }
  }, [fullAddress, selectedDuration, selectedAddons, selectedDate, provider, location, additionalSessions, providerTurnoverBuffer]);

  // Fetch the day's availability shape so we know if it's purely
  // in-studio (no client address required) or has any mobile windows
  // (address required as before). Lightweight call — payload is just
  // the blocks list with kind + populated staticLocation.
  useEffect(() => {
    const providerId = user?.accountType === 'PROVIDER' ? user._id : user?.providerId;
    if (!providerId || !selectedDate) return;
    let cancelled = false;
    (async () => {
      try {
        const dateLA = DateTime.fromJSDate(selectedDate).setZone(DEFAULT_TZ).toFormat('yyyy-MM-dd');
        const res = await api.get(`/api/availability/blocks/${dateLA}`, {
          params: { providerId },
        });
        if (!cancelled) setDayBlocks(res.data || []);
      } catch (err) {
        console.error('Failed to fetch day blocks:', err);
        if (!cancelled) setDayBlocks([]);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedDate, user?._id, user?.accountType, user?.providerId]);

  // Derive: is the entire day in-studio? If so, the address picker is
  // suppressed and the booking's location auto-fills from the studio.
  const dayIsPurelyStatic = dayBlocks.length > 0 && dayBlocks.every(b => b.kind === 'static' && b.staticLocation);
  const studioForDay = dayIsPurelyStatic ? dayBlocks[0].staticLocation : null;

  // Auto-fill location with the studio's coords when the day is
  // purely in-studio AND a CLIENT is self-booking. Provider-on-
  // behalf bookings keep the target client's address — the provider
  // is the source of truth and may take an in-home as a one-off
  // exception even on a normally-in-studio day.
  //
  // The ref tracks whether the current location was set by THIS
  // effect (vs typed by the user). When the user changes the date
  // off a static day onto a mobile one, we have to clear the auto-
  // filled studio address so the booking doesn't quietly keep going
  // to the studio. Without the ref guard we'd also wipe a manually
  // typed address every time the form mounted on a mobile day.
  const studioAutoFilledRef = useRef(false);
  useEffect(() => {
    if (isProviderBooking) return;
    if (dayIsPurelyStatic && studioForDay) {
      const studioFullAddress = `${studioForDay.name} — ${studioForDay.address}`;
      setLocation({
        lat: studioForDay.lat,
        lng: studioForDay.lng,
        address: studioForDay.address,
        fullAddress: studioFullAddress,
      });
      setFullAddress(studioFullAddress);
      studioAutoFilledRef.current = true;
    } else if (studioAutoFilledRef.current) {
      // Day flipped from purely-static to has-mobile (or no availability).
      // The studio address is no longer the right default. Restore the
      // recipient's saved address if they have one (the most-likely
      // intended location for a mobile booking), else drop to empty so
      // the picker re-renders blank. The empty fallback matters when the
      // recipient has no saved address — we don't want to silently keep
      // submitting to the studio.
      const restored = loadSavedAddress();
      if (!restored) {
        setLocation(null);
        setFullAddress('');
      }
      studioAutoFilledRef.current = false;
    }
  }, [dayIsPurelyStatic, isProviderBooking, studioForDay?.lat, studioForDay?.lng, studioForDay?.address, studioForDay?.name, loadSavedAddress]);

  // If the chain expands past where the user's selected time can fit
  // (added an addon, added another session, or the slot list refreshed),
  // clear selectedTime and surface a notice. Prevents the submit-fails-
  // with-"doesn't-fit" dead-end. Compares by ISO so a slot that's the
  // same exact moment is considered identical.
  //
  // Important: an empty availableSlots list AFTER a fetch is meaningful
  // — it means "no time today fits this chain at all," not "still
  // loading." The earlier version of this effect early-returned on
  // empty slots, which left a stale selectedTime in place when the user
  // pushed the chain past the day's longest contiguous window. The
  // server then rejected on submit. Treat empty as authoritative;
  // initial-load with no selection is handled by the !selectedTime
  // branch above.
  useEffect(() => {
    if (!selectedTime) {
      setStaleTimeNotice(null);
      return;
    }
    const stillValid = availableSlots.some(s => s.iso === selectedTime.iso);
    if (!stillValid) {
      setStaleTimeNotice(
        availableSlots.length === 0
          ? `No start time today fits this back-to-back chain. Try a different day, fewer sessions, or shorter durations.`
          : `Your previously selected time no longer fits this back-to-back chain. Pick a new time below.`
      );
      setSelectedTime(null);
    } else {
      setStaleTimeNotice(null);
    }
  }, [availableSlots, selectedTime]);

  // Handle booking submission
  const handleSubmit = async () => {
    if (loading) return;
    setError(null);
    setLoading(true);

    try {
      if (!selectedDate || !selectedTime || !fullAddress || !location || !selectedDuration) {
        throw new Error('Please complete all required fields');
      }

      const bookingDateLA = DateTime.fromJSDate(selectedDate).setZone(DEFAULT_TZ);
      const bookingDateStr = bookingDateLA.toFormat('yyyy-MM-dd');

      const formattedTime = LuxonService.formatISOToDisplay(selectedTime.iso, TIME_FORMATS.TIME_24H);
      if (!formattedTime) {
        throw new Error('Failed to format time correctly');
      }

      // For static slots the booking happens at the provider's studio,
      // not the client's address — pricing may also come from the
      // location's override instead of the provider's mobile tiers.
      const isStaticSlot = selectedTime.kind === 'static';
      const staticOverridePricing = isStaticSlot && !selectedTime.useMobilePricing && Array.isArray(selectedTime.pricing)
        ? selectedTime.pricing
        : null;

      // Calculate pricing from provider data — preferring the static
      // location's override when applicable.
      const pricingTier = staticOverridePricing
        ? staticOverridePricing.find(p => p.duration === selectedDuration)
        : durationOptions.find(p => p.duration === selectedDuration);
      const basePrice = pricingTier?.price || 0;
      const packageName = (pricingTier?.label && pricingTier.label.trim())
        || `${selectedDuration} min service`;

      const selectedAddonDetails = selectedAddons.map(name =>
        availableAddons.find(a => a.name === name)
      ).filter(Boolean);

      const addonsPrice = selectedAddonDetails.reduce((sum, a) => sum + (a.price || 0), 0);
      const extraTime = selectedAddonDetails.reduce((sum, a) => sum + (a.extraTime || 0), 0);

      // Provider-on-behalf bookings: the target client IS the recipient, and
      // we pass clientId so the backend records it against their account
      // rather than the provider's. Registered clients hit the existing
      // self/other recipient logic unchanged.
      const isOnBehalf = isProviderBooking && targetClient?._id;
      if (isOnBehalf === false && isProviderBooking) {
        throw new Error('Please pick a client before booking.');
      }

      // Location resolution:
      //   - Provider booking on behalf: ALWAYS use what's in the form.
      //     Provider intent wins, even on a "static slot" — they may
      //     be making an in-home exception on a normally in-studio day.
      //   - Client self-booking a static slot: override to the studio's
      //     address (the slot is in-studio, not at the client's home).
      //   - Otherwise: use the form's address (mobile booking).
      const useStaticLocationOverride =
        isStaticSlot && selectedTime.location && !isProviderBooking;
      const bookingData = {
        date: bookingDateStr,
        time: formattedTime,
        duration: selectedDuration + extraTime,
        location: useStaticLocationOverride
          ? {
              address: selectedTime.location.address,
              lat: selectedTime.location.lat,
              lng: selectedTime.location.lng,
            }
          : {
              address: fullAddress,
              lat: location.lat,
              lng: location.lng,
            },
        serviceType: {
          id: selectedServiceType,
          name: packageName
        },
        addons: selectedAddonDetails.map(addon => ({
          id: addon.name.toLowerCase().replace(/\s+/g, '-'),
          name: addon.name,
          price: addon.price,
          extraTime: addon.extraTime || 0
        })),
        pricing: {
          basePrice,
          addonsPrice,
          totalPrice: basePrice + addonsPrice
        },
        paymentMethod: selectedPaymentMethod,
        // Send the package id whenever one is selected — both for full
        // package payment (selectedPaymentMethod === 'package') AND for
        // partial redemption (paymentMethod is the secondary cash/card,
        // packageMinutesApplied tells the server how much to debit from
        // the package). The server reserves the credit atomically and
        // enforces all the ownership / paid-status / capacity rules.
        ...(selectedPackageId && {
          packagePurchaseId: selectedPackageId,
          packageMinutesApplied,
        }),
        ...(isOnBehalf
          ? {
              clientId: targetClient._id,
              recipientType: 'self',
            }
          : {
              recipientType,
              ...(recipientType === 'other' && {
                recipientInfo: {
                  name: recipientInfo.name,
                  phone: recipientInfo.phone,
                  email: recipientInfo.email || ''
                }
              })
            }),
      };

      // Single booking vs. back-to-back chain: when additional sessions
      // are configured, build a bulk payload (the time cascade was already
      // computed for display; the server reproduces it from the chain).
      let response;
      if (additionalSessions.length === 0) {
        response = await bookingService.createBooking(bookingData);
        if (!response || !response._id) throw new Error('Invalid booking response');
      } else {
        // Build per-session entries for the bulk endpoint. The server
        // re-derives times from the first session's time + cumulative
        // durations + buffer, so we don't include `time` on additional
        // sessions — and the server enforces same-date / same-address
        // / addon validity.
        const buildAddonDetails = (selectedNames) =>
          selectedNames.map(name => availableAddons.find(a => a.name === name)).filter(Boolean);

        const sessionsPayload = [
          {
            ...bookingData,
            // groupId is generated server-side; we don't pass one.
          },
          ...additionalSessions.map(s => {
            const addonDetails = buildAddonDetails(s.addons || []);
            const sExtraTime = addonDetails.reduce((sum, a) => sum + (a.extraTime || 0), 0);
            const sAddonsPrice = addonDetails.reduce((sum, a) => sum + (a.price || 0), 0);
            const tier = durationOptions.find(p => p.duration === s.duration);
            const sBasePrice = tier?.price || 0;
            const sLabel = (tier?.label && tier.label.trim()) || `${s.duration} min service`;
            return {
              date: bookingDateStr,
              // Bake addon extraTime into the duration so the server's
              // chain math (which sums per-session durations) matches
              // the totalDuration the slot picker showed. Without this
              // the server computes a shorter chain than the frontend
              // displayed, and end times stored on the saved bookings
              // are wrong even though validation passes.
              duration: s.duration + sExtraTime,
              location: bookingData.location,
              serviceType: { id: 'package', name: sLabel },
              addons: addonDetails.map(a => ({
                id: a.name.toLowerCase().replace(/\s+/g, '-'),
                name: a.name,
                price: a.price,
                extraTime: a.extraTime || 0,
              })),
              pricing: {
                basePrice: sBasePrice,
                addonsPrice: sAddonsPrice,
                totalPrice: sBasePrice + sAddonsPrice,
              },
              paymentMethod: selectedPaymentMethod, // chain shares first session's method in v1
              recipientType: s.recipientType,
              ...(s.recipientType === 'other' && {
                recipientInfo: {
                  name: s.recipientInfo?.name || '',
                  phone: s.recipientInfo?.phone || '',
                  email: s.recipientInfo?.email || '',
                },
              }),
            };
          }),
        ];

        // The /bulk endpoint computes times for sessions 2+. Drop the
        // unused `time` from those entries; the first session keeps its
        // explicit time (which is what the cascade pivots from).
        const apiResp = await bookingService.createBulkBookings(sessionsPayload);
        if (!Array.isArray(apiResp) || apiResp.length === 0) {
          throw new Error('Invalid bulk booking response');
        }
        // Treat the first booking as the primary for downstream UI (success
        // modal, Stripe redirect, etc.).
        response = apiResp[0];
      }

      setNewBookingId(response._id);

      // If card or venmo payment, show Stripe checkout (Venmo is handled via Stripe)
      // Route to Stripe for cards, and for Venmo only when the provider hasn't
      // configured a direct handle. Venmo-with-handle falls through to the
      // success screen where the client sees a "Pay on Venmo" deep link.
      const stripeRouted =
        selectedPaymentMethod === 'card' ||
        (selectedPaymentMethod === 'venmo' && !venmoHandle);

      if (stripeRouted) {
        setPendingBookingPrice(bookingData.pricing.totalPrice);
        setShowStripeCheckout(true);
      } else {
        setBookingSuccess(true);
      }
      // Booking consumed a slot — refresh calendar dots in case this
      // was the day's last opening.
      setCalendarRefreshKey(k => k + 1);
    } catch (err) {
      console.error('Error creating booking:', err);
      // err can be an Error instance (with .alternatives for chain
      // failures) or a plain string (single-booking createBooking still
      // throws strings). Read both shapes safely.
      const message = (err && err.message) || (typeof err === 'string' ? err : null) || 'Failed to create booking';
      setError(message);
      // If the server returned chain alternatives, drop the user's
      // selection so the slot picker re-prompts them; the alternatives
      // are already a subset of the slot list, so picking from the
      // freshly-rendered slot picker is the natural recovery path.
      if (err?.alternatives && err.alternatives.length > 0) {
        setSelectedTime(null);
        setStaleTimeNotice(
          `That time doesn't fit the chain (${err.chainDurationMin || 'combined'} min). ` +
          `Try one of these: ${err.alternatives.slice(0, 5).join(', ')}.`
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const isBookingComplete = () => {
    const isOnBehalf = isProviderBooking && targetClient?._id;
    const isRecipientComplete = isOnBehalf
      ? true
      : recipientType === 'self' ||
        (recipientType === 'other' && recipientInfo.name && recipientInfo.phone);

    // Each additional session in the chain must have a duration and, if
    // recipient is "other," a name. Phone is optional — many providers
    // already have the recipient's number out of band, and missing
    // numbers are handled gracefully downstream (SMS reminders simply
    // don't fire when there's no phone on file).
    const additionalsOk = additionalSessions.every(s => {
      if (!s.duration) return false;
      if (s.recipientType === 'other') {
        return !!s.recipientInfo?.name;
      }
      return true;
    });

    return (
      selectedDate &&
      fullAddress &&
      selectedTime &&
      selectedDuration &&
      isRecipientComplete &&
      additionalsOk &&
      (!isProviderBooking || !!targetClient?._id)
    );
  };

  const resetForm = () => {
    setSelectedDate(new Date());
    setSelectedTime(null);
    setFullAddress('');
    setLocation(null);
    setSelectedDuration(durationOptions.length > 0 ? durationOptions[0].duration : 60);
    setSelectedAddons([]);
    setSelectedPaymentMethod(acceptedPaymentMethods[0] || 'cash');
    setRecipientType('self');
    setRecipientInfo({ name: '', phone: '', email: '' });
    setAdditionalSessions([]);
    setBookingSuccess(false);
    window.scrollTo(0, 0);
  };

  return (
    <div className="av-paper pt-16">
      <div className="max-w-3xl mx-auto px-5 py-10 space-y-6">
        <div className="text-center mb-8 relative">
          {provider?.providerProfile?.logoUrl && (
            <img
              src={provider.providerProfile.logoUrl}
              alt={`${provider.providerProfile.businessName || 'Provider'} logo`}
              className="h-10 w-auto max-w-[180px] object-contain mb-3"
            />
          )}
          <div className="av-meta mb-2">The booking</div>
          <h1 className="font-display" style={{ fontSize: 36, lineHeight: 1.1, fontWeight: 500, letterSpacing: '-0.01em' }}>
            Choose a{' '}
            <em style={{ color: '#B07A4E' }}>
              {DateTime.now().setZone(DEFAULT_TZ).hour < 12 ? 'morning' : 'afternoon'}
            </em>
            {' '}or evening.
          </h1>
          {provider?.providerProfile?.businessName && (
            <p className="mt-2 text-sm text-ink-2">
              With {provider.providerProfile.businessName}
            </p>
          )}
        </div>

        <div className="space-y-6">
          {/* Provider-on-behalf banner — shown instead of the recipient selector
              when a provider is booking for one of their clients. The "Change"
              link re-opens the client picker so they can switch mid-flow. */}
          {isProviderBooking && (
            <div className="bg-paper-elev border border-line rounded-lg p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#B07A4E]/10 flex items-center justify-center flex-shrink-0">
                <UserIcon className="w-5 h-5 text-[#B07A4E]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs uppercase tracking-wide text-slate-500">Booking for</p>
                <p className="text-base font-medium text-slate-900 truncate flex items-center gap-2">
                  {targetClientLoading
                    ? 'Loading…'
                    : targetClient?.profile?.fullName || 'Pick a client'}
                  {targetClient?.isManaged && (
                    <span className="text-[10px] uppercase tracking-wide font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                      Managed
                    </span>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowClientPicker(true)}
                className="text-sm font-medium text-[#B07A4E] hover:text-[#8A5D36] px-3 py-1.5 rounded-lg hover:bg-[#B07A4E]/10"
              >
                Change
              </button>
            </div>
          )}

          {/* 1. Calendar */}
          <CalendarSection
            selectedDate={selectedDate}
            onDateChange={setSelectedDate}
            isComplete={selectedDate !== null}
            refreshKey={calendarRefreshKey}
          />

          {/* 2. Recipient — only for client self-bookings. When a provider
              books on behalf, the target client IS the recipient, shown in
              the banner above. */}
          {!isProviderBooking && (
            <RecipientSection
              recipientType={recipientType}
              recipientInfo={recipientInfo}
              onRecipientTypeChange={setRecipientType}
              onRecipientInfoChange={setRecipientInfo}
              isComplete={recipientType === 'self' || (recipientInfo.name && recipientInfo.phone)}
            />
          )}

          {/* 3. Address — the day's shape decides whether we even ask:
                - Purely in-studio + CLIENT self-booking: location is the
                  studio, full stop. Show a banner instead of an address
                  picker — they're being invited to the studio.
                - Provider booking on behalf: ALWAYS show the address
                  picker, defaulting to the target client's saved address.
                  The provider may take an in-home as a one-off exception
                  even on a normally-in-studio day. The provider's intent
                  in the form wins.
                - Otherwise: ask for the client's address (existing flow). */}
          {dayIsPurelyStatic && studioForDay && !isProviderBooking ? (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <MapPin className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-blue-900">
                    In-studio appointment
                  </p>
                  <p className="text-sm text-slate-700 mt-0.5">
                    {studioForDay.name}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {studioForDay.address}
                  </p>
                  <p className="text-xs text-slate-500 mt-2">
                    No address needed — clients come to this location on this day.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <AddressSection
              savedAddress={(() => {
                const addrSource = isProviderBooking ? targetClient : user;
                const addr = addrSource?.profile?.address;
                if (!addr) return null;
                const fullAddr = addr.formatted ||
                  (addr.street ? `${addr.street}${addr.unit ? ', ' + addr.unit : ''}, ${addr.city}, ${addr.state} ${addr.zip}` : null);
                if (!fullAddr) return null;
                return { fullAddress: fullAddr };
              })()}
              currentAddress={location}
              onAddressChange={handleAddressConfirmed}
              isComplete={fullAddress !== ''}
            />
          )}

          {/* 4. Duration — from provider's pricing */}
          <SimpleDurationSelector
            selectedDuration={selectedDuration}
            onDurationChange={setSelectedDuration}
            isComplete={selectedDuration !== null}
            durationOptions={durationOptions}
          />

          {/* 5. Add-ons — from provider's services */}
          <AddOnsSelector
            selectedAddons={selectedAddons}
            onAddonsChange={setSelectedAddons}
            isComplete={true}
            availableAddons={availableAddons}
          />

          {/* 6. Payment Method (incl. package-credit options when eligible) */}
          <PaymentMethodSelector
            selectedMethod={selectedPaymentMethod}
            onMethodChange={setSelectedPaymentMethod}
            acceptedMethods={acceptedPaymentMethods}
            isComplete={selectedPaymentMethod !== null}
            redeemablePackages={matchingPackages}
            selectedPackageId={selectedPackageId}
            onPackageSelect={setSelectedPackageId}
            bookingDuration={selectedDuration}
            bookingTotalPrice={(durationOptions.find(d => d.duration === selectedDuration)?.price || 0)
              + selectedAddons.reduce((sum, n) => {
                  const a = availableAddons.find(x => x.name === n);
                  return sum + (a?.price || 0);
                }, 0)}
          />

          {/* 7. Booking Summary. When the picked slot is in-studio, the
              location is the studio — surface that explicitly so the
              client doesn't think they're getting an in-home visit. */}
          <BookingSummaryCard
            selectedDuration={selectedDuration}
            selectedDate={selectedDate}
            selectedTime={selectedTime}
            fullAddress={
              selectedTime?.kind === 'static' && selectedTime?.location?.address && !isProviderBooking
                ? `${selectedTime.location.name} — ${selectedTime.location.address} (in-studio)`
                : (location?.fullAddress || fullAddress)
            }
            selectedAddons={selectedAddons}
            recipientType={recipientType}
            recipientInfo={recipientInfo}
            durationOptions={durationOptions}
            availableAddons={availableAddons}
            selectedPaymentMethod={selectedPaymentMethod}
            packageMinutesApplied={isPartialRedemption ? packageMinutesApplied : 0}
            packageName={selectedPackage?.name || null}
          />

          {/* 7. Available Time Slots */}
          <AvailableTimeSlots
            availableSlots={availableSlots}
            selectedTime={selectedTime}
            onTimeSelected={setSelectedTime}
            hasValidDuration={selectedDuration !== null}
            isComplete={selectedTime !== null}
            selectedDate={selectedDate}
          />

          {/* Surfaces when the chain expanded (added session, added addon,
              or server rejected the picked time with a list of fits) and
              the user's previous time pick is no longer valid. */}
          {staleTimeNotice && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-card text-sm text-amber-800">
              {staleTimeNotice}
            </div>
          )}

          {/* Back-to-back chain — only surfaced after a time is picked, so
              the addition is a deliberate "I want another session right
              after this one" decision rather than clutter at first sight.
              Each additional session inherits the address; the time
              auto-cascades from the first session + standard buffer. */}
          {selectedTime && selectedDuration && (
            <div className="space-y-3">
              {additionalSessions.length > 0 && (
                <div className="bg-paper-deep border border-line rounded-lg p-4 space-y-3">
                  <p className="text-sm font-semibold text-slate-900">
                    Back-to-back at this address
                  </p>
                  {additionalSessions.map((session, i) => {
                    // Cascade: each session's start = previous end + buffer.
                    // Compute from the first selected slot forward.
                    const firstStartIso = selectedTime?.iso;
                    if (!firstStartIso) return null;
                    const firstStart = DateTime.fromISO(firstStartIso, { zone: DEFAULT_TZ });
                    const firstExtraTime = selectedAddons.reduce((sum, name) => {
                      const a = availableAddons.find(x => x.name === name);
                      return sum + (a?.extraTime || 0);
                    }, 0);
                    let cursor = firstStart.plus({ minutes: selectedDuration + firstExtraTime + intraBufferMin });
                    for (let j = 0; j < i; j++) {
                      const earlier = additionalSessions[j];
                      const earlierExtra = (earlier.addons || []).reduce((sum, name) => {
                        const a = availableAddons.find(x => x.name === name);
                        return sum + (a?.extraTime || 0);
                      }, 0);
                      cursor = cursor.plus({ minutes: (earlier.duration || 0) + earlierExtra + intraBufferMin });
                    }
                    const thisExtra = (session.addons || []).reduce((sum, name) => {
                      const a = availableAddons.find(x => x.name === name);
                      return sum + (a?.extraTime || 0);
                    }, 0);
                    const thisEnd = cursor.plus({ minutes: (session.duration || 0) + thisExtra });
                    return (
                      <AdditionalSessionRow
                        key={i}
                        index={i}
                        session={session}
                        durationOptions={durationOptions}
                        availableAddons={availableAddons}
                        computedStart={cursor.toFormat('h:mm a')}
                        computedEnd={thisEnd.toFormat('h:mm a')}
                        onChange={(next) => {
                          setAdditionalSessions(prev => prev.map((s, idx) => idx === i ? next : s));
                        }}
                        onRemove={() => {
                          setAdditionalSessions(prev => prev.filter((_, idx) => idx !== i));
                        }}
                      />
                    );
                  })}
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  if (additionalSessions.length >= 5) return;
                  setAdditionalSessions(prev => [
                    ...prev,
                    {
                      recipientType: 'other',
                      recipientInfo: { name: '', phone: '', email: '' },
                      duration: durationOptions[0]?.duration || 60,
                      addons: [],
                    },
                  ]);
                }}
                disabled={additionalSessions.length >= 5}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-3
                  border-2 border-dashed border-slate-300 text-slate-600 rounded-lg
                  hover:border-[#B07A4E] hover:text-[#B07A4E] transition-colors
                  disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
              >
                <Plus className="w-4 h-4" />
                {additionalSessions.length === 0
                  ? 'Add another session right after at this address'
                  : 'Add one more session'}
              </button>
            </div>
          )}

          {/* Error display */}
          {error && (
            <div className="p-4 border border-red-200 rounded-card flex items-start gap-2"
              style={{ background: 'rgba(165,70,65,0.08)' }}>
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 pt-6">
            <button
              onClick={() => navigate('/')}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2
                px-5 py-3 rounded-btn border border-line bg-transparent text-ink
                hover:bg-paper-deep transition text-[14px] font-medium"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Go Back</span>
            </button>

            <button
              onClick={handleSubmit}
              disabled={!isBookingComplete() || loading}
              className={`flex-1 inline-flex items-center justify-center gap-2
                px-6 py-3.5 rounded-btn text-[15px] font-medium transition
                ${isBookingComplete()
                  ? 'bg-accent text-white hover:bg-accent-ink'
                  : 'bg-paper-deep text-ink-3 cursor-not-allowed'
                }`}
              style={isBookingComplete() ? { boxShadow: '0 1px 2px rgba(0,0,0,0.08)' } : {}}
            >
              {loading ? (
                <span>Processing...</span>
              ) : (
                <>
                  <span>Confirm booking</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>

        {/* Client picker — providers must choose a client before booking.
            Auto-opens when /book is visited without ?clientId=, and can be
            reopened via the "Change" link in the banner above. */}
        {showClientPicker && isProviderBooking && (
          <ClientPickerModal
            currentClientId={targetClient?._id}
            onSelect={handleClientPicked}
            onClose={() => setShowClientPicker(false)}
            canDismiss={!!targetClient?._id}
          />
        )}

        {/* Stripe Checkout Modal (shown after booking created with card payment) */}
        {showStripeCheckout && newBookingId && (
          <StripeCheckout
            bookingId={newBookingId}
            totalPrice={pendingBookingPrice}
            onSuccess={() => {
              setShowStripeCheckout(false);
              setBookingSuccess(true);
            }}
            onClose={() => {
              // Close checkout — booking still exists but unpaid
              setShowStripeCheckout(false);
              setBookingSuccess(true);
            }}
          />
        )}

        {/* Booking Confirmation Modal */}
        <BookingConfirmationModal
          isVisible={bookingSuccess}
          bookingDetails={(() => {
            const tier = durationOptions.find(p => p.duration === selectedDuration);
            const packageName = (tier?.label && tier.label.trim())
              || (selectedDuration ? `${selectedDuration} min service` : 'Service');
            const basePrice = tier?.price || 0;
            const selectedAddonDetails = selectedAddons
              .map(name => availableAddons.find(a => a.name === name))
              .filter(Boolean);
            const addonsPrice = selectedAddonDetails.reduce((s, a) => s + (a.price || 0), 0);
            const extraTime = selectedAddonDetails.reduce((s, a) => s + (a.extraTime || 0), 0);
            return {
              selectedTime,
              selectedDate,
              fullAddress: selectedTime?.kind === 'static' && selectedTime?.location?.address && !isProviderBooking
                ? `${selectedTime.location.name} — ${selectedTime.location.address} (in-studio)`
                : fullAddress,
              numSessions: 1,
              bookingId: newBookingId,
              selectedDuration,
              selectedAddons,
              selectedServiceType,
              serviceTypes: [{ id: selectedServiceType, name: packageName }],
              addons: availableAddons.map(a => ({ id: a.name, name: a.name, price: a.price })),
              pricing: { basePrice, addonsPrice, totalPrice: basePrice + addonsPrice, extraTime },
              recipientType,
              recipientInfo,
              paymentMethod: selectedPaymentMethod,
              venmoHandle,
              providerName: provider?.providerProfile?.businessName || null,
              providerLogoUrl: provider?.providerProfile?.logoUrl || null,
              providerPhone: provider?.profile?.phoneNumber || null,
              clientName: user?.profile?.fullName || '',
              packageName,
              packageMinutesApplied: isPartialRedemption ? packageMinutesApplied : 0,
            };
          })()}
          onViewBookings={() => navigate('/my-bookings')}
          onReturnToDashboard={() => navigate('/admin')}
          onBookAnother={resetForm}
        />
      </div>
    </div>
  );
};

export default BookingForm;
