import React, { useState, useEffect, useContext, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AuthContext } from '../AuthContext';
import { bookingService } from '../services/bookingService';
import api from '../services/api';
import { DateTime } from 'luxon';
import { TIME_FORMATS, tzOf } from '../utils/timeConstants';
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

  // Ref on the bottom Confirm button — used to scroll it into view
  // when the wizard finishes, so the user lands at the action they
  // need to take (not somewhere in the middle of the populated page).
  const confirmButtonRef = useRef(null);

  // True wizard. ONE step's component is visible at a time, with Back
  // and Continue inside. After the user finishes the last step (time),
  // the wizard collapses and the page fully populates: every step's
  // info shown in their components plus payment, summary, the
  // "add another at this address?" CTA, and Confirm.
  //
  // Order is fixed: Recipient → Date → Address → Duration → Time →
  // Review. Provider's recipient step is structurally different from
  // the client's (pick existing managed client vs. enter a one-off
  // guest by name/phone — guests do NOT add to the roster).
  const [wizardStepIdx, setWizardStepIdx] = useState(0);

  // Provider guest-recipient mode flag — set by the wizard's recipient
  // step when the provider chooses "someone new (one-off)" instead of
  // picking from their managed-client list. Drives whether the form
  // submits with `clientId` (managed) or without it (server attributes
  // the booking to the provider's own _id as a placeholder).
  const [providerGuestMode, setProviderGuestMode] = useState(false);

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
          } = servicesRes.data;

          if (providerMethods && providerMethods.length > 0) {
            // Temporary: filter out 'card' until Stripe is on live keys.
            // The provider can re-enable on the Services page once we
            // flip from test to production; the option will reappear
            // automatically since this is just a display filter.
            const visibleMethods = providerMethods.filter(m => m !== 'card');
            const safeMethods = visibleMethods.length > 0 ? visibleMethods : ['cash'];
            setAcceptedPaymentMethods(safeMethods);
            setSelectedPaymentMethod(safeMethods[0]);
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
      // Don't auto-open the ClientPickerModal anymore — the wizard's
      // recipient step is the entry point. Providers can pick an
      // existing client from there, or skip the modal entirely and
      // book for a one-off guest by name/phone (no roster add).
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

  // When a client is picked inline, swap the URL so reloads land in the
  // same context. Address/preferences reload via the targetClient effect
  // below; date/duration/add-ons already chosen are preserved. Also
  // clears the provider-guest-mode flag and resets recipient back to
  // 'self' (the picked client) — picking a real client supersedes any
  // prior "one-off" or "someone else" choice the wizard was carrying.
  const handleClientPicked = (client) => {
    setShowClientPicker(false);
    setSelectedTime(null);
    setAvailableSlots([]);
    setProviderGuestMode(false);
    setRecipientType('self');
    setRecipientInfo({ name: '', phone: '', email: '' });
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
  // minutes from the package, pay the rest via cash/card/zelle).
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

    // Parse the selected date in the target provider's TZ — for
    // provider self-bookings this is `user`; for client bookings it's
    // the provider object loaded above.
    const targetTz = isProviderBooking ? tzOf(user) : tzOf(provider);
    const dateLA = DateTime.fromJSDate(selectedDate).setZone(targetTz);
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
      // 60-min lead time uses absolute "now" — TZ-agnostic.
      const cutoff = DateTime.now().plus({ minutes: 60 });
      const slots = (response.data || [])
        .map(s => {
          // Backwards-compat: tolerate the old shape where the endpoint
          // returned bare ISO strings, just in case any caller still
          // hits it that way during a transition.
          if (typeof s === 'string') return { time: s, kind: 'mobile' };
          return s;
        })
        .filter(s => {
          // Use setZone: true so the offset baked into the slot's ISO
          // (provider-local) is preserved — comparing absolute instants.
          const dt = DateTime.fromISO(s.time, { setZone: true });
          return dt > cutoff;
        })
        .map(s => {
          const dt = DateTime.fromISO(s.time, { setZone: true });
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
        const targetTz = isProviderBooking ? tzOf(user) : tzOf(provider);
        const dateLA = DateTime.fromJSDate(selectedDate).setZone(targetTz).toFormat('yyyy-MM-dd');
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

      const targetTz = isProviderBooking ? tzOf(user) : tzOf(provider);
      const bookingDateLA = DateTime.fromJSDate(selectedDate).setZone(targetTz);
      const bookingDateStr = bookingDateLA.toFormat('yyyy-MM-dd');

      // formatISOToDisplay defaults to LA — pass the target provider's
      // TZ so the HH:mm submitted to /api/bookings matches the provider
      // wall clock (the server then anchors with provider.timezone too).
      const formattedTime = LuxonService.formatISOToDisplay(selectedTime.iso, TIME_FORMATS.TIME_24H, targetTz);
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
      // Provider can book in two flavors: (a) for an existing managed
      // client (targetClient set), or (b) for a one-off guest entered
      // inline in the recipient step (providerGuestMode + recipientInfo
      // filled). Reject if neither — the wizard's recipient step
      // shouldn't have advanced without one of these being true, but
      // belt-and-suspenders.
      const isOnBehalfManaged = isProviderBooking && targetClient?._id;
      const isProviderGuest = isProviderBooking
        && providerGuestMode
        && !targetClient
        && !!recipientInfo.name;
      if (isProviderBooking && !isOnBehalfManaged && !isProviderGuest) {
        throw new Error('Please pick a client or enter a recipient name before booking.');
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
        ...(isOnBehalfManaged
          ? {
              // Owner is Kari. Recipient is whoever was picked:
              // 'self' = Kari herself, 'other' = a named guest like
              // Kim. Sending recipientInfo on 'other' so the booking
              // shows the actual recipient's name without inflating
              // the managed-client roster.
              clientId: targetClient._id,
              recipientType,
              ...(recipientType === 'other' && {
                recipientInfo: {
                  name: recipientInfo.name,
                  phone: recipientInfo.phone,
                  email: recipientInfo.email || ''
                }
              })
            }
          : isProviderGuest
            ? {
                // True clientless one-off. No clientId — the server
                // attributes the booking to the provider's own _id
                // as a placeholder so the schema's required `client`
                // ref is satisfied. No managed-client doc created.
                recipientType: 'other',
                recipientInfo: {
                  name: recipientInfo.name,
                  phone: recipientInfo.phone,
                  email: recipientInfo.email || ''
                }
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

      // Card payments route through Stripe Checkout (Connect direct
      // charge on the provider's connected account). Cash + Zelle
      // skip Stripe entirely — settled in person, recorded by the
      // provider after the fact.
      if (selectedPaymentMethod === 'card') {
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

  // Wizard step ordering. Recipient is always first, even for
  // providers (their recipient step has a different shape — pick an
  // existing managed client vs. enter a one-off guest). Address is
  // skipped for clients on purely-static days (the studio is the
  // implicit location; asking would be misleading). Provider bookings
  // always get the address step — they may take in-home exceptions
  // even on a normally-in-studio day.
  const showAddressStep = !(dayIsPurelyStatic && studioForDay && !isProviderBooking);
  const wizardOrder = ['recipient', 'date'];
  if (showAddressStep) wizardOrder.push('address');
  wizardOrder.push('duration');
  // Add-ons gets its own step only when the provider has add-ons
  // configured. Skipping the step entirely when there are zero
  // add-ons means a clean wizard for providers who don't offer them.
  if (availableAddons.length > 0) wizardOrder.push('addons');
  wizardOrder.push('time', 'addanother');

  const wizardComplete = wizardStepIdx >= wizardOrder.length;
  const currentWizardStep = wizardOrder[wizardStepIdx] || null;

  // Validation per step — drives whether Continue is enabled.
  //
  // Recipient step shapes:
  //   - Client self-booking: recipientType 'self' is always valid;
  //     'other' needs a name (phone optional).
  //   - Provider on-behalf (targetClient set, came from a client
  //     page): always valid as long as targetClient resolved. The
  //     recipient sub-toggle defaults to 'self' (the owner gets the
  //     massage); 'other' adds a name field. Owner stays Kari even
  //     when recipient is Kim — that's how Kari's saved address
  //     remains the default in the Address step.
  //   - Provider one-off (no client owner): providerGuestMode is on
  //     and the form needs a name. Phone always optional — forcing
  //     it blocks providers doing in-person data entry where the
  //     phone is out of band.
  const isWizardStepValid = (id) => {
    switch (id) {
      case 'recipient':
        if (isProviderBooking) {
          if (targetClient?._id) {
            // Owner picked. Recipient defaults to 'self' (the owner);
            // 'other' needs a name. Phone optional.
            return recipientType === 'self'
              || (recipientType === 'other' && !!recipientInfo.name);
          }
          // No owner picked yet — only valid path forward is an
          // explicit one-off with a recipient name on file.
          return providerGuestMode && !!recipientInfo.name;
        }
        return recipientType === 'self'
          || (recipientType === 'other' && !!recipientInfo.name);
      case 'date':
        return !!selectedDate;
      case 'address':
        return !!fullAddress && !!location;
      case 'duration':
        return !!selectedDuration;
      case 'addons':
        // Always advanceable — add-ons are optional. Picking zero
        // is a valid answer.
        return true;
      case 'time':
        return !!selectedTime;
      case 'addanother':
        // Always advanceable — adding another session is optional.
        // The step exists so the question is in the user's face, but
        // "no thanks, just one" is a perfectly valid answer.
        return true;
      default:
        return true;
    }
  };

  // Clamp the wizard step when the order shrinks (e.g. date change
  // makes it a purely-static day → address step disappears). Without
  // this the user could be parked at an index that no longer maps to
  // a real step, freezing the wizard.
  useEffect(() => {
    // Only clamp if past the end. Never auto-rewind to step 0 — that
    // would yank the user backward unexpectedly when they're still
    // mid-flow.
    if (wizardStepIdx > wizardOrder.length) {
      setWizardStepIdx(wizardOrder.length);
    }
  }, [wizardOrder.length, wizardStepIdx]);

  // Scroll the Confirm button into view when the wizard finishes —
  // the user needs to see what action to take next, not be parked
  // mid-page above 800px of summary content. Two RAFs so the new
  // review-mode DOM has time to render and lay out before we measure
  // its bottom; without that, scrollIntoView fires while the page is
  // still wizard-height and lands somewhere in the middle.
  useEffect(() => {
    if (!wizardComplete) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        confirmButtonRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'end',
        });
      });
    });
  }, [wizardComplete]);

  // If the chain (back-to-back add-another step) makes the picked
  // time no longer fit, snap back to the time step. Without this
  // the user could be parked at "addanother" with a stale time and
  // hit Continue → submit fails. The staleTimeNotice from the slot
  // invalidator is the trigger.
  useEffect(() => {
    if (!staleTimeNotice) return;
    const timeIdx = wizardOrder.indexOf('time');
    if (timeIdx >= 0 && wizardStepIdx > timeIdx) {
      setWizardStepIdx(timeIdx);
    }
  }, [staleTimeNotice, wizardOrder, wizardStepIdx]);

  const isBookingComplete = () => {
    const isOnBehalfManaged = isProviderBooking && targetClient?._id;
    const isProviderGuest = isProviderBooking
      && providerGuestMode
      && !targetClient
      && !!recipientInfo.name;

    // For provider-on-behalf: owner is set; recipient is either
    // self (the owner) or someone else (named). For client self-
    // booking: same self/other split. For provider one-off: name
    // captured inline. Phone optional throughout.
    const isRecipientComplete = isOnBehalfManaged
      ? (recipientType === 'self' || (recipientType === 'other' && !!recipientInfo.name))
      : isProviderGuest
        ? true
        : (recipientType === 'self' ||
           (recipientType === 'other' && recipientInfo.name));

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
      (!isProviderBooking || isOnBehalfManaged || isProviderGuest)
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
    setWizardStepIdx(0);
    setProviderGuestMode(false);
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
          <h1 className="font-display" style={{ fontSize: "2.25rem", lineHeight: 1.1, fontWeight: 500, letterSpacing: '-0.01em' }}>
            Choose a{' '}
            <em style={{ color: '#B07A4E' }}>
              {DateTime.now().setZone(isProviderBooking ? tzOf(user) : tzOf(provider)).hour < 12 ? 'morning' : 'afternoon'}
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
          {/* Cancel / exit the booking flow entirely. Sits above the
              wizard so it doesn't get confused with the wizard's own
              Back button (which moves between wizard steps). */}
          <button
            onClick={() => navigate('/')}
            className="inline-flex items-center gap-1.5 text-sm text-ink-2 hover:text-ink"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Cancel booking</span>
          </button>

          {!wizardComplete ? (
            /* WIZARD MODE — single step + Back/Continue. Only the
               current step's component is visible; nothing above it,
               nothing below it. After the user finishes 'time', this
               whole branch unmounts and the full populated layout
               (review mode below) takes over. */
            <>
              <div className="text-xs uppercase tracking-wide text-slate-500">
                Step {wizardStepIdx + 1} of {wizardOrder.length}
              </div>

              {currentWizardStep === 'recipient' && (
                isProviderBooking ? (
                  /* Provider's recipient picker — split into two
                     concepts:
                       1. Booking owner: who's the booking attached
                          to (Kari, an existing managed client). Drives
                          address book, payment history, etc.
                       2. Recipient: who's actually getting the
                          massage. Defaults to the owner; can be
                          someone else (e.g. Kari's friend Kim) without
                          inflating the roster.
                     If the provider hits Book without an owner picked,
                     we offer "Pick existing client" or "One-off" (true
                     clientless walk-in) up front. */
                  targetClient?._id ? (
                    <div className="bg-paper-elev rounded-lg shadow-sm p-6 border border-line space-y-5">
                      {/* Booking owner — banner with Change link */}
                      <div className="bg-paper-deep border border-line rounded-lg p-4 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-[#B07A4E]/10 flex items-center justify-center flex-shrink-0">
                          <UserIcon className="w-5 h-5 text-[#B07A4E]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs uppercase tracking-wide text-slate-500">Booking for</p>
                          <p className="text-base font-medium text-slate-900 truncate">
                            {targetClient.profile?.fullName}
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

                      {/* Recipient sub-question */}
                      <div>
                        <p className="text-base font-semibold text-slate-900 mb-2">
                          Who's getting the massage?
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                          <button
                            type="button"
                            onClick={() => {
                              setRecipientType('self');
                              setRecipientInfo({ name: '', phone: '', email: '' });
                            }}
                            className={`p-3 rounded-lg border-2 text-left transition-colors
                              ${recipientType === 'self'
                                ? 'border-teal-600 bg-teal-50'
                                : 'border-line hover:border-teal-300'}`}
                          >
                            <div className="font-medium text-slate-900 text-sm">
                              {targetClient.profile?.fullName?.split(' ')[0] || 'Owner'} herself
                            </div>
                            <div className="text-xs text-slate-500 mt-0.5">
                              Standard booking
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={() => setRecipientType('other')}
                            className={`p-3 rounded-lg border-2 text-left transition-colors
                              ${recipientType === 'other'
                                ? 'border-teal-600 bg-teal-50'
                                : 'border-line hover:border-teal-300'}`}
                          >
                            <div className="font-medium text-slate-900 text-sm">
                              Someone else
                            </div>
                            <div className="text-xs text-slate-500 mt-0.5">
                              Friend, family — no roster add
                            </div>
                          </button>
                        </div>
                      </div>

                      {/* Recipient details — only when "Someone else" */}
                      {recipientType === 'other' && (
                        <div className="space-y-3 pt-2">
                          <input
                            type="text"
                            value={recipientInfo.name}
                            onChange={(e) => setRecipientInfo({ ...recipientInfo, name: e.target.value })}
                            placeholder="Recipient's full name"
                            className="w-full px-4 py-3 text-base border border-line rounded-lg
                              focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                          />
                          <input
                            type="tel"
                            inputMode="tel"
                            value={recipientInfo.phone}
                            onChange={(e) => setRecipientInfo({ ...recipientInfo, phone: e.target.value })}
                            placeholder="Phone (optional) — (555) 555-5555"
                            className="w-full px-4 py-3 text-base border border-line rounded-lg
                              focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                          />
                          <input
                            type="email"
                            value={recipientInfo.email}
                            onChange={(e) => setRecipientInfo({ ...recipientInfo, email: e.target.value })}
                            placeholder="Email (optional)"
                            className="w-full px-4 py-3 text-base border border-line rounded-lg
                              focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                          />
                        </div>
                      )}
                    </div>
                  ) : (
                    /* No owner picked — choose existing client OR
                       book a one-off without a client owner. */
                    <div className="bg-paper-elev rounded-lg shadow-sm p-6 border border-line space-y-4">
                      <div>
                        <h3 className="text-xl font-semibold text-slate-900">Who is this booking for?</h3>
                        <p className="text-sm text-slate-600 mt-1">
                          Pick an existing client, or book a one-off — a
                          one-off does NOT add anyone to your client list.
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            setProviderGuestMode(false);
                            setShowClientPicker(true);
                          }}
                          className="p-4 rounded-lg border-2 border-line hover:border-teal-300 text-left transition-colors"
                        >
                          <UserIcon className="w-5 h-5 text-teal-700 mb-2" />
                          <div className="font-medium text-slate-900">Existing client</div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            Pick from your client list
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setProviderGuestMode(true);
                            if (recipientType !== 'other') setRecipientType('other');
                          }}
                          className={`p-4 rounded-lg border-2 text-left transition-colors
                            ${providerGuestMode
                              ? 'border-teal-600 bg-teal-50'
                              : 'border-line hover:border-teal-300'}`}
                        >
                          <Plus className="w-5 h-5 text-teal-700 mb-2" />
                          <div className="font-medium text-slate-900">One-off</div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            No client owner — walk-in
                          </div>
                        </button>
                      </div>

                      {providerGuestMode && (
                        <div className="space-y-3">
                          <input
                            type="text"
                            value={recipientInfo.name}
                            onChange={(e) => setRecipientInfo({ ...recipientInfo, name: e.target.value })}
                            placeholder="Recipient's full name"
                            className="w-full px-4 py-3 text-base border border-line rounded-lg
                              focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                          />
                          <input
                            type="tel"
                            inputMode="tel"
                            value={recipientInfo.phone}
                            onChange={(e) => setRecipientInfo({ ...recipientInfo, phone: e.target.value })}
                            placeholder="Phone (optional) — (555) 555-5555"
                            className="w-full px-4 py-3 text-base border border-line rounded-lg
                              focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                          />
                          <input
                            type="email"
                            value={recipientInfo.email}
                            onChange={(e) => setRecipientInfo({ ...recipientInfo, email: e.target.value })}
                            placeholder="Email (optional)"
                            className="w-full px-4 py-3 text-base border border-line rounded-lg
                              focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                          />
                        </div>
                      )}
                    </div>
                  )
                ) : (
                  <RecipientSection
                    recipientType={recipientType}
                    recipientInfo={recipientInfo}
                    onRecipientTypeChange={setRecipientType}
                    onRecipientInfoChange={setRecipientInfo}
                    isComplete={recipientType === 'self' || (recipientInfo.name && recipientInfo.phone)}
                  />
                )
              )}

              {currentWizardStep === 'date' && (
                <CalendarSection
                  selectedDate={selectedDate}
                  onDateChange={setSelectedDate}
                  isComplete={selectedDate !== null}
                  refreshKey={calendarRefreshKey}
                />
              )}

              {currentWizardStep === 'address' && (
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

              {currentWizardStep === 'duration' && (
                <SimpleDurationSelector
                  selectedDuration={selectedDuration}
                  onDurationChange={setSelectedDuration}
                  isComplete={selectedDuration !== null}
                  durationOptions={durationOptions}
                />
              )}

              {/* Add-ons — its own wizard step so it gets the same
                  one-decision-at-a-time framing as the rest. The
                  step itself is conditionally added to wizardOrder
                  only when the provider has add-ons configured, so
                  no-addons providers don't see an empty step. */}
              {currentWizardStep === 'addons' && (
                <AddOnsSelector
                  selectedAddons={selectedAddons}
                  onAddonsChange={setSelectedAddons}
                  isComplete={true}
                  availableAddons={availableAddons}
                />
              )}

              {currentWizardStep === 'time' && (
                <>
                  <AvailableTimeSlots
                    availableSlots={availableSlots}
                    selectedTime={selectedTime}
                    onTimeSelected={setSelectedTime}
                    hasValidDuration={selectedDuration !== null}
                    isComplete={selectedTime !== null}
                    selectedDate={selectedDate}
                  />
                  {staleTimeNotice && (
                    <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-card text-sm text-amber-800">
                      {staleTimeNotice}
                    </div>
                  )}
                </>
              )}

              {/* "Want another massage right after at this same
                  address?" — its own wizard step so the question is
                  in the user's face rather than a footer they might
                  scroll past. Always advanceable: not adding any
                  additional sessions ("just one") is the most common
                  answer and that's fine. The chain editor renders
                  inline so the user can tweak each added session
                  before continuing. */}
              {currentWizardStep === 'addanother' && (
                <div className="space-y-4">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-5">
                    <p className="text-base font-semibold text-blue-900 mb-1">
                      Want another massage right after at this same address?
                    </p>
                    <p className="text-sm text-blue-800/80">
                      Same provider, same location — book a second session
                      back-to-back (for someone else, or for you again).
                      Your provider stays put. Hit "Continue" if you're
                      done with just one.
                    </p>
                  </div>

                  {additionalSessions.length > 0 && (
                    <div className="bg-paper-deep border border-line rounded-lg p-4 space-y-3">
                      <p className="text-sm font-semibold text-slate-900">
                        Back-to-back at this address
                      </p>
                      {additionalSessions.map((session, i) => {
                        const firstStartIso = selectedTime?.iso;
                        if (!firstStartIso) return null;
                        const firstStart = DateTime.fromISO(firstStartIso, { setZone: true });
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
                    className={`w-full inline-flex items-center justify-center gap-2 px-4 py-3
                      ${additionalSessions.length === 0
                        ? 'bg-[#B07A4E] text-white hover:bg-[#8A5D36]'
                        : 'border-2 border-dashed border-slate-300 text-slate-600 hover:border-[#B07A4E] hover:text-[#B07A4E]'
                      } rounded-lg disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors`}
                  >
                    <Plus className="w-4 h-4" />
                    {additionalSessions.length === 0
                      ? 'Yes, add another session'
                      : 'Add one more session'}
                  </button>
                </div>
              )}

              {/* Back + Continue. Back is disabled on step 1.
                  Continue advances; on the last wizard step it
                  finishes the wizard and the page populates fully
                  with payment + summary + Confirm. */}
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setWizardStepIdx(i => Math.max(0, i - 1))}
                  disabled={wizardStepIdx === 0}
                  className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2
                    px-5 py-3 rounded-btn border border-line bg-transparent text-ink
                    hover:bg-paper-deep transition text-[14px] font-medium
                    disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back</span>
                </button>
                <button
                  type="button"
                  onClick={() => setWizardStepIdx(i => Math.min(i + 1, wizardOrder.length))}
                  disabled={!isWizardStepValid(currentWizardStep)}
                  className={`flex-1 inline-flex items-center justify-center gap-2
                    px-6 py-3.5 rounded-btn text-[15px] font-medium transition
                    ${isWizardStepValid(currentWizardStep)
                      ? 'bg-accent text-white hover:bg-accent-ink shadow-sm'
                      : 'bg-paper-deep text-ink-3 cursor-not-allowed'}`}
                >
                  <span>Continue</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </>
          ) : (
            /* REVIEW MODE — wizard finished. Full populated layout:
               every step's component is visible (so the user can
               scroll up and edit anything), plus payment, summary,
               back-to-back CTA, and Confirm. */
            <>
              {/* Recipient summary in review mode. Three shapes:
                    - targetClient + recipientType='self': standard
                      "Booking for [Kari]"
                    - targetClient + recipientType='other': "Booking
                      for [Kari]" + sub-line "Recipient: [Kim]"
                    - no targetClient + providerGuestMode: one-off */}
              {isProviderBooking ? (
                targetClient ? (
                  <div className="bg-paper-elev border border-line rounded-lg p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[#B07A4E]/10 flex items-center justify-center flex-shrink-0">
                      <UserIcon className="w-5 h-5 text-[#B07A4E]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs uppercase tracking-wide text-slate-500">Booking for</p>
                      <p className="text-base font-medium text-slate-900 truncate">
                        {targetClient.profile?.fullName}
                      </p>
                      {recipientType === 'other' && recipientInfo.name && (
                        <p className="text-xs text-slate-600 truncate mt-0.5">
                          Recipient: {recipientInfo.name}
                          {recipientInfo.phone ? ` · ${recipientInfo.phone}` : ''}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setWizardStepIdx(0)}
                      className="text-sm font-medium text-[#B07A4E] hover:text-[#8A5D36] px-3 py-1.5 rounded-lg hover:bg-[#B07A4E]/10"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <div className="bg-paper-elev border border-line rounded-lg p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[#B07A4E]/10 flex items-center justify-center flex-shrink-0">
                      <UserIcon className="w-5 h-5 text-[#B07A4E]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs uppercase tracking-wide text-slate-500">Booking for (one-off)</p>
                      <p className="text-base font-medium text-slate-900 truncate">
                        {recipientInfo.name}
                      </p>
                      <p className="text-xs text-slate-500 truncate">
                        {recipientInfo.phone}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setWizardStepIdx(0)}
                      className="text-sm font-medium text-[#B07A4E] hover:text-[#8A5D36] px-3 py-1.5 rounded-lg hover:bg-[#B07A4E]/10"
                    >
                      Change
                    </button>
                  </div>
                )
              ) : (
                <RecipientSection
                  recipientType={recipientType}
                  recipientInfo={recipientInfo}
                  onRecipientTypeChange={setRecipientType}
                  onRecipientInfoChange={setRecipientInfo}
                  isComplete={recipientType === 'self' || (recipientInfo.name && recipientInfo.phone)}
                />
              )}

              <CalendarSection
                selectedDate={selectedDate}
                onDateChange={setSelectedDate}
                isComplete={selectedDate !== null}
                refreshKey={calendarRefreshKey}
              />

              {/* Address: studio banner if applicable, otherwise picker */}
              {dayIsPurelyStatic && studioForDay && !isProviderBooking ? (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <MapPin className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-blue-900">In-studio appointment</p>
                      <p className="text-sm text-slate-700 mt-0.5">{studioForDay.name}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{studioForDay.address}</p>
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

              <SimpleDurationSelector
                selectedDuration={selectedDuration}
                onDurationChange={setSelectedDuration}
                isComplete={selectedDuration !== null}
                durationOptions={durationOptions}
              />

              {availableAddons.length > 0 && (
                <AddOnsSelector
                  selectedAddons={selectedAddons}
                  onAddonsChange={setSelectedAddons}
                  isComplete={true}
                  availableAddons={availableAddons}
                />
              )}

              <AvailableTimeSlots
                availableSlots={availableSlots}
                selectedTime={selectedTime}
                onTimeSelected={setSelectedTime}
                hasValidDuration={selectedDuration !== null}
                isComplete={selectedTime !== null}
                selectedDate={selectedDate}
              />

              {staleTimeNotice && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-card text-sm text-amber-800">
                  {staleTimeNotice}
                </div>
              )}

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
                additionalSessions={additionalSessions}
              />

              {/* Back-to-back chain editor + the prominent
                  "another massage at this address?" CTA. Only when a
                  time has been picked (no time = no chain to anchor). */}
              {selectedTime && selectedDuration && (
                <div className="space-y-3">
                  {additionalSessions.length > 0 && (
                    <div className="bg-paper-deep border border-line rounded-lg p-4 space-y-3">
                      <p className="text-sm font-semibold text-slate-900">
                        Back-to-back at this address
                      </p>
                      {additionalSessions.map((session, i) => {
                        const firstStartIso = selectedTime?.iso;
                        if (!firstStartIso) return null;
                        const firstStart = DateTime.fromISO(firstStartIso, { setZone: true });
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

                  {/* The prominent "Want another?" prompt lives in
                      the wizard's 'addanother' step now — by the time
                      the user reaches Review they've already answered.
                      Just leave a small affordance here for "actually
                      I want to add one more" tweaks. Capped at 5 to
                      match the chain limit. */}
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
                      ? 'Add another session at this address'
                      : 'Add one more session'}
                  </button>
                </div>
              )}

              {error && (
                <div className="p-4 border border-red-200 rounded-card flex items-start gap-2"
                  style={{ background: 'rgba(165,70,65,0.08)' }}>
                  <p className="text-red-700 text-sm">{error}</p>
                </div>
              )}

              <button
                ref={confirmButtonRef}
                onClick={handleSubmit}
                disabled={!isBookingComplete() || loading}
                className={`w-full inline-flex items-center justify-center gap-2
                  px-6 py-3.5 rounded-btn text-[15px] font-medium transition
                  ${isBookingComplete() && !loading
                    ? 'bg-accent text-white hover:bg-accent-ink shadow-sm'
                    : 'bg-paper-deep text-ink-3 cursor-not-allowed'}`}
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
            </>
          )}
        </div>

        {/* Client picker — providers must choose a client before booking.
            Auto-opens when /book is visited without ?clientId=, and can be
            reopened via the "Change" link in the banner above. */}
        {showClientPicker && isProviderBooking && (
          <ClientPickerModal
            currentClientId={targetClient?._id}
            onSelect={handleClientPicked}
            onClose={() => setShowClientPicker(false)}
            canDismiss={true}
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

            // Chain payload for the multi-session modal branch. The
            // server creates these atomically as a single chain — the
            // modal previously only showed session 1 because numSessions
            // was hardcoded. Build per-session arrays so the modal
            // renders the full chain with each recipient + duration +
            // pricing line.
            const numSessions = 1 + additionalSessions.length;
            const firstRecipientLabel = recipientType === 'self'
              ? (user?.profile?.fullName || 'You')
              : (recipientInfo?.name || 'Other recipient');
            const sessionList = [
              {
                recipient: firstRecipientLabel,
                duration: selectedDuration + extraTime,
                price: basePrice + addonsPrice,
                paymentMethod: selectedPaymentMethod,
                packageName: selectedPackage?.name || null,
                packageMinutesApplied: isPartialRedemption ? packageMinutesApplied : 0,
              },
              ...additionalSessions.map(s => {
                const sTier = durationOptions.find(p => p.duration === s.duration);
                const sBase = sTier?.price || 0;
                const sAddonDetails = (s.addons || [])
                  .map(name => availableAddons.find(a => a.name === name))
                  .filter(Boolean);
                const sAddonsPrice = sAddonDetails.reduce((sum, a) => sum + (a.price || 0), 0);
                const sExtraTime = sAddonDetails.reduce((sum, a) => sum + (a.extraTime || 0), 0);
                const recipientLabel = s.recipientType === 'self'
                  ? firstRecipientLabel
                  : (s.recipientInfo?.name || 'Other recipient');
                return {
                  recipient: recipientLabel,
                  duration: s.duration + sExtraTime,
                  price: sBase + sAddonsPrice,
                  // v1: chain shares the first session's payment method;
                  // per-session payment is a v2 deferred item per
                  // plans/packages-v2.md.
                  paymentMethod: selectedPaymentMethod,
                  packageName: null,
                  packageMinutesApplied: 0,
                };
              }),
            ];
            const sessionDurations = sessionList.map(s => s.duration);
            const sessionNames = sessionList.map(s => s.recipient);
            const chainTotalPrice = sessionList.reduce((sum, s) => sum + s.price, 0);

            return {
              selectedTime,
              selectedDate,
              fullAddress: selectedTime?.kind === 'static' && selectedTime?.location?.address && !isProviderBooking
                ? `${selectedTime.location.name} — ${selectedTime.location.address} (in-studio)`
                : fullAddress,
              numSessions,
              sessionDurations,
              sessionNames,
              sessions: sessionList,
              chainTotalPrice,
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
