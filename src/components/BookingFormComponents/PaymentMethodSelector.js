import React from 'react';
import { Banknote, CreditCard, Smartphone, Layers } from 'lucide-react';

const PAYMENT_METHOD_CONFIG = {
  cash: { label: 'Cash', icon: Banknote, description: 'Pay in person' },
  zelle: { label: 'Zelle', icon: Smartphone, description: 'Bank transfer' },
  card: { label: 'Card', icon: CreditCard, description: 'Credit/Debit card' },
};

// PaymentMethodSelector renders package-credit options + per-method
// buttons. Two redemption shapes:
//
//   - FULL: package balance (or session) covers the whole booking.
//     Picking the package sets selectedMethod='package', and the per-
//     method buttons collapse to "selected via package."
//
//   - PARTIAL: a minutes-mode package has positive balance but less
//     than the booking duration. Picking it leaves selectedMethod as
//     a non-package method (the parent demotes 'package' → first
//     accepted method automatically). The per-method buttons then act
//     as the SECONDARY picker for the uncovered minutes, and we show
//     a price breakdown so the client knows exactly what they're paying.
const PaymentMethodSelector = ({
  selectedMethod,
  onMethodChange,
  acceptedMethods = ['cash'],
  isComplete = false,
  redeemablePackages = [],
  selectedPackageId = null,
  onPackageSelect = () => {},
  bookingDuration = null,
  bookingTotalPrice = 0,
}) => {
  const methods = acceptedMethods
    .filter(m => PAYMENT_METHOD_CONFIG[m])
    .map(m => ({ id: m, ...PAYMENT_METHOD_CONFIG[m] }));

  if (methods.length === 0 && redeemablePackages.length === 0) return null;

  // Per-package partial detection. A minutes-mode package with positive
  // balance but less than the booking duration redeems partially.
  const isPackagePartial = (pkg) => {
    if (!bookingDuration) return false;
    if (pkg.kind !== 'minutes') return false;
    return (pkg.minutesRemaining || 0) > 0 && (pkg.minutesRemaining || 0) < bookingDuration;
  };

  const selectedPackage = selectedPackageId
    ? redeemablePackages.find(p => p._id === selectedPackageId)
    : null;
  const partialMode = !!(selectedPackage && isPackagePartial(selectedPackage));

  // Price breakdown shown under the package list when in partial mode.
  // Per-minute rate × uncovered minutes = secondary amount due.
  const partialBreakdown = (() => {
    if (!partialMode || !bookingDuration || !bookingTotalPrice) return null;
    const covered = selectedPackage.minutesRemaining || 0;
    const uncovered = bookingDuration - covered;
    const perMinute = bookingTotalPrice / bookingDuration;
    const owed = Math.round(perMinute * uncovered * 100) / 100;
    return { covered, uncovered, owed };
  })();

  return (
    <div className="bg-paper-elev rounded-lg shadow-sm p-6 border border-line">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-900">Payment Method</h3>
        {isComplete && (
          <span className="text-xs font-medium text-teal-600 bg-teal-50 px-2 py-1 rounded-full">
            Selected
          </span>
        )}
      </div>

      {/* Package credit options — surfaced first when available since they're
          essentially "already paid." Selecting one switches selectedMethod to
          'package' and records which specific package the credit comes from.
          Sessions-mode packages show "X of Y remaining" in sessions; minutes-
          mode packages show minutes-remaining since each booking debits a
          variable amount. */}
      {redeemablePackages.length > 0 && (
        <div className="mb-3 space-y-2">
          {redeemablePackages.map(pkg => {
            const partial = isPackagePartial(pkg);
            const isSelected = selectedPackageId === pkg._id &&
              (partial || selectedMethod === 'package');
            // Detail line: minutes-mode shows minutes remaining (with a
            // session-count hint when displayPack is set so the buyer
            // recognizes "how many of my 90-min credits are left"). Legacy
            // sessions-mode packages keep their session-count display.
            let detail;
            if (pkg.kind === 'minutes') {
              const remain = pkg.minutesRemaining ?? 0;
              const total = pkg.minutesTotal || 0;
              if (pkg.displayPack?.sessionDuration > 0) {
                const sess = Math.floor(remain / pkg.displayPack.sessionDuration);
                detail = `${remain} / ${total} min (≈ ${sess} × ${pkg.displayPack.sessionDuration}-min)`;
              } else {
                detail = `${remain} of ${total} min remaining`;
              }
            } else {
              detail = `${pkg.sessionsRemaining} of ${pkg.sessionsTotal} remaining`;
            }
            return (
              <button
                key={pkg._id}
                type="button"
                onClick={() => {
                  onPackageSelect(pkg._id);
                  // FULL: switch to 'package' as the payment method.
                  // PARTIAL: leave method alone — parent's effect demotes
                  // 'package' → first accepted method so the user picks a
                  // secondary method below.
                  if (!partial) {
                    onMethodChange('package');
                  }
                }}
                className={`w-full flex items-center gap-3 p-3 rounded-lg border-2 transition-all text-left
                  ${isSelected
                    ? 'border-[#B07A4E] bg-[#B07A4E]/5 ring-1 ring-[#B07A4E]/30'
                    : 'border-line hover:border-slate-300 hover:bg-paper-deep'
                  }`}
              >
                <Layers className={`w-5 h-5 flex-shrink-0 ${
                  isSelected ? 'text-[#B07A4E]' : 'text-slate-500'
                }`} />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${
                    isSelected ? 'text-[#8A5D36]' : 'text-slate-700'
                  }`}>
                    {partial
                      ? `Apply ${pkg.minutesRemaining} min from package`
                      : 'Use package credit'}
                  </p>
                  <p className="text-xs text-slate-500 truncate">
                    {pkg.name} · {detail}
                  </p>
                  {partial && (
                    <p className="text-xs text-[#B07A4E] mt-0.5">
                      Covers part of this booking — pick how to pay for the rest below.
                    </p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Partial-mode breakdown header. Only renders when the selected
          package can't cover the full booking — explicitly tells the
          client what they'll owe via the secondary method. */}
      {partialBreakdown && (
        <div className="mb-3 p-3 rounded-lg bg-paper-deep border border-line text-sm">
          <p className="text-slate-700">
            <span className="font-medium">{partialBreakdown.covered} min</span>
            {' from your package + '}
            <span className="font-medium">{partialBreakdown.uncovered} min</span>
            {' to pay below'}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            Owed at appointment: <span className="font-semibold text-slate-700">${partialBreakdown.owed.toFixed(2)}</span>
          </p>
        </div>
      )}

      {methods.length > 0 && (
        <>
          {partialMode && (
            <p className="text-xs font-medium text-slate-600 mb-2">
              Pay for the remaining {partialBreakdown?.uncovered ?? ''} min via:
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            {methods.map(({ id, label, icon: Icon, description }) => {
              const isSelected = selectedMethod === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    onMethodChange(id);
                    // In partial mode, KEEP the package selection — the
                    // user is just choosing how to pay the uncovered part.
                    if (!partialMode) {
                      onPackageSelect(null);
                    }
                  }}
                  className={`flex items-center gap-3 p-3 rounded-lg border-2 transition-all text-left
                    ${isSelected
                      ? 'border-teal-500 bg-teal-50 ring-1 ring-teal-200'
                      : 'border-line hover:border-slate-300 hover:bg-paper-deep'
                    }`}
                >
                  <Icon className={`w-5 h-5 flex-shrink-0 ${
                    isSelected ? 'text-teal-600' : 'text-slate-500'
                  }`} />
                  <div>
                    <p className={`text-sm font-medium ${
                      isSelected ? 'text-teal-900' : 'text-slate-700'
                    }`}>{label}</p>
                    <p className="text-xs text-slate-500">{description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

export default PaymentMethodSelector;
