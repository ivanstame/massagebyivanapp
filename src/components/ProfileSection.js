// src/components/ProfileSection.js
import React from 'react';
import { CSSTransition } from 'react-transition-group';
import { ChevronDown, ChevronUp, Edit2, X } from 'lucide-react';

const ProfileSection = ({
  title,
  children,
  isEditing,
  isExpanded = true,
  canEdit = true,
  onEdit,
  onToggle
}) => {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden mb-4">
      {/* Section Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-100">
        <h2 className="text-lg font-medium text-slate-900">{title}</h2>
        <div className="flex items-center space-x-2">
          {canEdit && !isEditing && (
            <button
              onClick={onEdit}
              className="text-slate-400 hover:text-[#B07A4E] transition-colors"
              aria-label="Edit section"
            >
              <Edit2 size={18} />
            </button>
          )}
          {isEditing && (
            <button
              onClick={onEdit}
              className="text-slate-400 hover:text-red-500 transition-colors"
              aria-label="Cancel editing"
            >
              <X size={18} />
            </button>
          )}
          {onToggle && (
            <button
              onClick={onToggle}
              className="text-slate-400 hover:text-[#B07A4E] transition-colors"
              aria-label={isExpanded ? 'Collapse section' : 'Expand section'}
            >
              {isExpanded ? (
                <ChevronUp size={18} />
              ) : (
                <ChevronDown size={18} />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Section Content with Animation */}
      <CSSTransition
        in={isExpanded}
        timeout={300}
        classNames="section"
        unmountOnExit
      >
        <div className="p-4">
          {children}
        </div>
      </CSSTransition>
    </div>
  );
};

export default ProfileSection;