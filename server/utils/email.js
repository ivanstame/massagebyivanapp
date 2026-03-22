const nodemailer = require('nodemailer');

const createTransporter = () => {
  const host = process.env.EMAIL_HOST;
  const port = parseInt(process.env.EMAIL_PORT, 10) || 587;
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;

  if (!host || !user || !pass) {
    console.warn('Email configuration incomplete. Set EMAIL_HOST, EMAIL_USER, and EMAIL_PASS environment variables.');
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass }
  });
};

const sendPasswordResetEmail = async (toEmail, resetToken) => {
  const transporter = createTransporter();

  if (!transporter) {
    console.error('Cannot send password reset email: email not configured');
    throw new Error('Email service not configured');
  }

  const baseUrl = process.env.REACT_APP_API_URL || process.env.APP_URL || 'http://localhost:3000';
  const resetUrl = `${baseUrl}/reset-password/${resetToken}`;
  const fromEmail = process.env.EMAIL_FROM || process.env.EMAIL_USER;

  const mailOptions = {
    from: `"Massage by Ivan" <${fromEmail}>`,
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
  };

  await transporter.sendMail(mailOptions);
};

module.exports = { sendPasswordResetEmail };
