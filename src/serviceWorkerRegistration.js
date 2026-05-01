// Lightweight service-worker registration.
//
// Only registers in production. The `onUpdate` callback fires when a
// new SW is installed and waiting — the React layer surfaces this via
// the existing UpdateAvailableBanner so the user can choose when to
// reload (rather than the SW silently swapping in mid-session and
// breaking unsaved booking-form state).

export function register({ onUpdate } = {}) {
  if (process.env.NODE_ENV !== 'production') return;
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        // If a new SW was installed before this page even loaded (e.g.,
        // the user kept a tab open across a deploy), surface immediately.
        if (registration.waiting && navigator.serviceWorker.controller) {
          if (typeof onUpdate === 'function') onUpdate(registration);
        }

        registration.addEventListener('updatefound', () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              // New SW is waiting; old SW is still controlling.
              if (typeof onUpdate === 'function') onUpdate(registration);
            }
          });
        });
      })
      .catch((err) => {
        console.error('Service worker registration failed:', err);
      });

    // When the SW finally takes over (after skipWaiting + reload), the
    // controller changes. Reload once so the new assets load cleanly.
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  });
}

// Tell the waiting SW to take over. Called when the user clicks the
// "Reload" button in the update banner. The controllerchange listener
// above will trigger the actual page reload.
export function applyUpdate(registration) {
  if (!registration || !registration.waiting) {
    window.location.reload();
    return;
  }
  registration.waiting.postMessage({ type: 'SKIP_WAITING' });
}

export function unregister() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.ready.then((registration) => registration.unregister());
}
