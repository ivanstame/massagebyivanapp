import React from 'react';
import { Check, Edit3, ArrowRight } from 'lucide-react';

/**
 * WizardStep — shell that wraps each section of the booking flow so the
 * form behaves as a one-step-at-a-time wizard rather than a long single
 * page. Three visual states:
 *
 *   - active:    the section is rendered full-width with a Continue button.
 *   - completed: collapsed summary card with an Edit link that jumps the
 *                wizard back to this step.
 *   - upcoming:  not rendered at all (the user hasn't reached it).
 *
 * Behavior knobs:
 *   stepNumber — 1-indexed position shown to the user.
 *   title      — step heading.
 *   summary    — short text shown when collapsed (e.g. "Tuesday, May 5").
 *   active     — currently the focused step.
 *   completed  — already filled in; renders the collapsed card.
 *   canContinue — disables the Continue button until the section's
 *                 inputs are valid (mirrors each component's existing
 *                 isComplete prop).
 *   onContinue — fires when the user advances. Caller bumps the step
 *                index in form state.
 *   onEdit     — fires when the user clicks the collapsed-card Edit
 *                link. Caller drops the wizard back to this step.
 *   continueLabel — override for the button text (e.g. final step uses
 *                   "Confirm booking").
 */
const WizardStep = ({
  stepNumber,
  title,
  summary,
  active,
  completed,
  canContinue,
  onContinue,
  onEdit,
  continueLabel = 'Continue',
  children,
}) => {
  if (!active && !completed) return null;

  if (completed) {
    return (
      <button
        type="button"
        onClick={onEdit}
        className="w-full text-left bg-paper-elev border border-line rounded-lg px-4 py-3
          flex items-center gap-3 hover:border-[#B07A4E]/60 hover:bg-paper-deep
          transition-colors group"
      >
        <div className="w-7 h-7 rounded-full bg-[#B07A4E]/15 flex items-center justify-center flex-shrink-0">
          <Check className="w-4 h-4 text-[#B07A4E]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">
            Step {stepNumber} · {title}
          </p>
          {summary && (
            <p className="text-sm text-slate-800 truncate">{summary}</p>
          )}
        </div>
        <Edit3 className="w-4 h-4 text-slate-400 group-hover:text-[#B07A4E] flex-shrink-0" />
      </button>
    );
  }

  return (
    <div className="bg-paper-elev border border-line rounded-lg shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-line-soft flex items-center gap-3 bg-paper-deep">
        <div className="w-7 h-7 rounded-full bg-[#B07A4E] text-white flex items-center justify-center text-sm font-semibold flex-shrink-0">
          {stepNumber}
        </div>
        <p className="text-base font-semibold text-slate-900">{title}</p>
      </div>
      <div className="p-5">
        {children}
      </div>
      {onContinue && (
        <div className="px-5 pb-5">
          <button
            type="button"
            onClick={onContinue}
            disabled={!canContinue}
            className={`w-full inline-flex items-center justify-center gap-2
              px-5 py-3 rounded-btn text-[15px] font-medium transition
              ${canContinue
                ? 'bg-accent text-white hover:bg-accent-ink shadow-sm'
                : 'bg-paper-deep text-ink-3 cursor-not-allowed'}`}
          >
            <span>{continueLabel}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};

export default WizardStep;
