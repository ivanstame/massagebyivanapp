import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import ProviderAvailability from '../../src/components/ProviderAvailability';
import { AuthContext } from '../../src/AuthContext';
import { BrowserRouter } from 'react-router-dom';
import axios from 'axios';
import { DateTime } from 'luxon';

// Mock axios
jest.mock('axios');

// Mock child components to simplify testing
jest.mock('../../src/components/ResponsiveCalendar', () => ({ onDateChange }) => (
  <div data-testid="responsive-calendar">
    <button onClick={() => onDateChange(new Date())}>Change Date</button>
  </div>
));

jest.mock('../../src/components/DaySchedule', () => ({ onModify }) => (
  <div data-testid="day-schedule">
    <button onClick={() => onModify({ _id: '1', start: '09:00', end: '10:00' })}>
      Modify Block
    </button>
  </div>
));

jest.mock('../../src/components/AvailabilityList', () => ({ onModify, onDelete, onAdd }) => (
  <div data-testid="availability-list">
    <button onClick={onAdd}>Add Availability</button>
    <button onClick={() => onModify({ _id: '1', start: '09:00', end: '10:00' })}>Edit</button>
    <button onClick={() => onDelete({ _id: '1', start: '09:00', end: '10:00' })}>Delete</button>
  </div>
));

jest.mock('../../src/components/AddAvailabilityModal', () => ({ onClose, onAdd }) => (
  <div data-testid="add-availability-modal">
    <button onClick={() => onAdd({ start: '10:00', end: '11:00' })}>Confirm Add</button>
    <button onClick={onClose}>Close</button>
  </div>
));

jest.mock('../../src/components/ModifyAvailabilityModal', () => ({ onClose, onModify }) => (
  <div data-testid="modify-availability-modal">
    <button onClick={() => onModify({ _id: '1', start: '10:00', end: '11:00' })}>Confirm Modify</button>
    <button onClick={onClose}>Close</button>
  </div>
));

const mockUser = {
  _id: 'provider123',
  accountType: 'PROVIDER',
  firstName: 'Test',
  lastName: 'Provider'
};

const renderComponent = async () => {
  let result;
  await act(async () => {
    result = render(
      <AuthContext.Provider value={{ user: mockUser }}>
        <BrowserRouter>
          <ProviderAvailability />
        </BrowserRouter>
      </AuthContext.Provider>
    );
  });
  return result;
};

describe('ProviderAvailability', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    axios.get.mockResolvedValue({ data: [] });
  });

  test('renders without crashing', async () => {
    await renderComponent();
    expect(screen.getByText('Manage Availability')).toBeInTheDocument();
    expect(screen.getByText('Timeline View')).toBeInTheDocument();
    expect(screen.getByText('List View')).toBeInTheDocument();
  });

  test('switches tabs correctly', async () => {
    await renderComponent();
    
    // Default should be Timeline View
    expect(screen.getByTestId('day-schedule')).toBeInTheDocument();
    expect(screen.queryByTestId('availability-list')).not.toBeInTheDocument();

    // Switch to List View
    fireEvent.click(screen.getByText('List View'));
    expect(screen.getByTestId('availability-list')).toBeInTheDocument();
    expect(screen.queryByTestId('day-schedule')).not.toBeInTheDocument();

    // Switch back to Timeline View
    fireEvent.click(screen.getByText('Timeline View'));
    expect(screen.getByTestId('day-schedule')).toBeInTheDocument();
  });

  test('opens add availability modal', async () => {
    await renderComponent();
    
    const addButtons = screen.getAllByText('Add Availability');
    fireEvent.click(addButtons[0]); // Click the header button

    expect(screen.getByTestId('add-availability-modal')).toBeInTheDocument();
  });

  test('handles adding availability', async () => {
    axios.post.mockResolvedValue({ data: { success: true } });
    await renderComponent();

    fireEvent.click(screen.getAllByText('Add Availability')[0]);
    
    await act(async () => {
      fireEvent.click(screen.getByText('Confirm Add'));
    });

    await waitFor(() => {
      expect(axios.post).toHaveBeenCalledWith('/api/availability', expect.objectContaining({
        provider: 'provider123',
        start: '10:00',
        end: '11:00'
      }), expect.any(Object));
    });
  });

  test('handles modifying availability from timeline', async () => {
    axios.put.mockResolvedValue({ status: 200 });
    await renderComponent();

    fireEvent.click(screen.getByText('Modify Block')); // In DaySchedule mock
    expect(screen.getByTestId('modify-availability-modal')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Confirm Modify'));
    });

    await waitFor(() => {
      expect(axios.put).toHaveBeenCalled();
    });
  });

  test('handles deleting availability from list view', async () => {
    axios.delete.mockResolvedValue({ status: 200 });
    await renderComponent();

    // Switch to List View
    fireEvent.click(screen.getByText('List View'));
    
    // Click delete in list
    // Since there are multiple "Delete" buttons (one in the list mock, potentially others), we need to be specific
    // The mock AvailabilityList renders a button with text "Delete"
    const deleteButton = screen.getByText('Delete');
    fireEvent.click(deleteButton);
    
    // Should show confirmation modal
    expect(screen.getByText('Delete Availability Block?')).toBeInTheDocument();
    
    // Confirm delete
    // The confirmation modal also has a "Delete" button. 
    // We need to find the one in the modal.
    // The modal structure in ProviderAvailability.js:
    // <button ...>Delete</button> inside the modal
    
    const modalDeleteButton = screen.getAllByText('Delete')[1]; // Assuming the second one is in the modal
    
    await act(async () => {
      fireEvent.click(modalDeleteButton);
    });

    await waitFor(() => {
      expect(axios.delete).toHaveBeenCalled();
    });
  });
});
