import React from 'react';
import { Clock, AlertCircle } from 'lucide-react';

const AvailabilityList = ({ 
  availabilityBlocks, 
  onModify, 
  onDelete, 
  formatTime, 
  formatDuration,
  onAdd,
  requestState,
  error,
  conflictInfo,
  renderConflictInfo
}) => {
  
  const renderLoadingState = () => (
    <div className="text-center py-8">
      <div className="animate-spin inline-block w-8 h-8 border-4 border-[#387c7e] border-t-transparent rounded-full mb-4" />
      <p className="text-slate-600">Loading availability data...</p>
    </div>
  );

  const renderErrorState = () => (
    <div className="p-4 bg-red-50 border-l-4 border-red-500 rounded">
      <div className="flex items-center">
        <AlertCircle className="h-5 w-5 text-red-400 mr-3" />
        <div>
          <p className="text-sm text-red-700">Failed to load availability data. Please try again.</p>
        </div>
      </div>
    </div>
  );

  if (requestState === 'LOADING') return renderLoadingState();
  if (requestState === 'ERROR') return renderErrorState();

  if (availabilityBlocks.length === 0) {
    return (
      <div className="text-center py-8 bg-slate-50 rounded-lg border-2 border-dashed border-slate-200">
        <p className="text-slate-600">
          No availability set for this date.
        </p>
        <button 
          onClick={onAdd}
          className="mt-4 inline-flex items-center px-4 py-2 bg-[#009ea5] hover:bg-[#a5825d] text-white rounded-md
            transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2
            focus:ring-[#009ea5] shadow-sm"
        >
          <Clock className="w-5 h-5 mr-2" />
          Add First Availability Block
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-4 bg-red-50 border-l-4 border-red-500 rounded">
          <div className="flex">
            <div className="flex-shrink-0">
              <AlertCircle className="h-5 w-5 text-red-400" />
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </div>
        </div>
      )}
      
      {renderConflictInfo && renderConflictInfo()}
      
      {availabilityBlocks.map((block, index) => (
        <div 
          key={block._id || index} 
          className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden
            transition duration-200 ease-in-out hover:shadow-md"
        >
          <div className="p-4">
            <div className="flex justify-between items-start">
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <span className="text-base font-medium text-slate-900">
                    {formatTime(block.start)} - {formatTime(block.end)}
                  </span>
                  <span className="px-2.5 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-800">
                    Available
                  </span>
                </div>
                <p className="text-sm text-slate-500">
                  {formatDuration(block.start, block.end)}
                </p>
              </div>
              
              <div className="flex items-center space-x-2">
                <button 
                  onClick={() => onModify(block)}
                  className="inline-flex items-center px-3 py-1.5 bg-white border border-slate-300
                    text-sm font-medium rounded-md text-slate-700 hover:bg-slate-50
                    focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#387c7e]
                    transition-colors duration-200 ease-in-out"
                >
                  Edit
                </button>
                
                <button 
                  onClick={() => onDelete(block)}
                  className="inline-flex items-center px-3 py-1.5 bg-white border border-red-300
                    text-sm font-medium rounded-md text-red-700 hover:bg-red-50
                    focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500
                    transition-colors duration-200 ease-in-out"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}
      
      <button 
        onClick={onAdd}
        className="w-full flex items-center justify-center px-4 py-3 bg-[#009ea5] text-white
          rounded-md hover:bg-[#a5825d] transition-colors duration-200 ease-in-out
          focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#009ea5]
          shadow-sm"
      >
        <Clock className="w-5 h-5 mr-2" />
        Add New Availability Block
      </button>
    </div>
  );
};

export default AvailabilityList;
