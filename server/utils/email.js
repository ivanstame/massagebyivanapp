const { Resend } = require('resend');

const getResendClient = () => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('RESEND_API_KEY environment variable is not set.');
    return null;
  }
  return new Resend(apiKey);
};

const sendPasswordResetEmail = async (toEmail, resetToken) => {
  const resend = getResendClient();

  if (!resend) {
    console.error('Cannot send password reset email: Resend not configured');
    throw new Error('Email service not configured');
  }

  const baseUrl = process.env.REACT_APP_API_URL || process.env.APP_URL || 'http://localhost:3000';
  const resetUrl = `${baseUrl}/reset-password/${resetToken}`;
  const fromEmail = process.env.EMAIL_FROM || 'onboarding@resend.dev';

  const { error } = await resend.emails.send({
    from: `Massage by Ivan <${fromEmail}>`,
    to: toEmail,
    subject: 'Password Reset Request',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #387c7e; padding: 20px; text-align: center;">
          <h1 style="color: white; margin: 0;">Massage by Ivan</h1>
        </div>
        <div style="padding: 30px; background-color: #f9fafb;">
          <h2 style="color: #333;">Password Reset</h2>
          <p style="color: #555; line-height: 1.6;">
            You requested a password reset. Click the button below to set a new password.
            This link will expire in <strong>1 hour</strong>.
          </p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" style="background-color: #387c7e; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">
              Reset Password
            </a>
          </div>
          <p style="color: #888; font-size: 14px;">
            If you didn't request this, you can safely ignore this email. Your password won't be changed.
          </p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
          <p style="color: #aaa; font-size: 12px;">
            If the button doesn't work, copy and paste this link into your browser:<br/>
            <a href="${resetUrl}" style="color: #387c7e;">${resetUrl}</a>
          </p>
        </div>
      </div>
    `
  });

  if (error) {
    console.error('Resend error:', error);
    throw new Error(error.message || 'Failed to send email');
  }
};

module.exports = { sendPasswordResetEmail };
