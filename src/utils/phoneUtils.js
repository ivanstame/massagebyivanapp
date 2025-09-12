// Phone number formatting utility functions

/**
 * Formats a phone number to (XXX) XXX-XXXX format
 * @param {string} phoneNumber - The raw phone number string
 * @returns {string} Formatted phone number
 */
export const formatPhoneNumber = (phoneNumber) => {
  // Remove all non-digit characters
  const cleaned = phoneNumber.replace(/\D/g, '');
  
  // Format based on length
  if (cleaned.length <= 3) {
    return cleaned;
  } else if (cleaned.length <= 6) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3)}`;
  } else {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6, 10)}`;
  }
};

/**
 * Handles phone number input change with formatting
 * @param {Event} e - The input change event
 * @param {Function} setValue - The state setter function
 */
export const handlePhoneNumberChange = (e, setValue) => {
  const input = e.target.value;
  // Remove all non-digit characters except parentheses, spaces, and dashes for backspacing
  const cleaned = input.replace(/[^\d\(\)\s\-]/g, '');
  
  // If backspacing, allow it without reformatting
  if (input.length < e.target.previousValue?.length) {
    setValue(input);
    e.target.previousValue = input;
    return;
  }
  
  // Remove all non-digits to get the raw number
  const digits = cleaned.replace(/\D/g, '');
  
  // Format the phone number
  const formatted = formatPhoneNumber(digits);
  
  setValue(formatted);
  e.target.previousValue = formatted;
};

/**
 * Validates if a phone number has at least 10 digits
 * @param {string} phoneNumber - The phone number to validate
 * @returns {boolean} True if valid, false otherwise
 */
export const isValidPhoneNumber = (phoneNumber) => {
  const digits = phoneNumber.replace(/\D/g, '');
  return digits.length >= 10;
};