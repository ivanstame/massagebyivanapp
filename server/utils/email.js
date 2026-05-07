const { Resend } = require('resend');
const { DateTime } = require('luxon');

const getResendClient = () => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('RESEND_API_KEY environment variable is not set.');
    return null;
  }
  return new Resend(apiKey);
};

const FROM_EMAIL = () => process.env.EMAIL_FROM || 'onboarding@resend.dev';
const BASE_URL = () => process.env.REACT_APP_API_URL || process.env.APP_URL || 'http://localhost:3000';

// Platform-level brand for emails with no provider context (password
// reset, account-level mail). Booking-related mail is branded with the
// provider's own name + optional logo via brandFromProvider().
//
// Wordmark URL is computed lazily so a dev environment without
// REACT_APP_API_URL/APP_URL set still gets a usable image — though if
// the eventual recipient's mail client can't reach localhost the image
// will broken-image-icon. Production should always have BASE_URL
// resolving to https://avayble.app.
const PLATFORM_NAME = 'Avayble';
const platformBrand = () => ({
  name: PLATFORM_NAME,
  logoUrl: `${BASE_URL()}/avayble-wordmark.png`,
});

// Default accent color for brand chrome. Per-provider color theming
// is a v2 thing — for now every provider uses the same atelier copper.
const BRAND_COLOR = '#B07A4E';

// ---------------------------------------------------------------------------
// Helper: derive a brand object from a provider User doc
// ---------------------------------------------------------------------------

function brandFromProvider(provider) {
  if (!provider) return platformBrand();
  const name =
    provider.providerProfile?.businessName ||
    provider.profile?.fullName ||
    provider.email ||
    'Avayble';
  const logoUrl = provider.providerProfile?.logoUrl || null;
  return { name, logoUrl };
}

// ---------------------------------------------------------------------------
// Shared email wrapper
// ---------------------------------------------------------------------------

function emailWrapper(brand, title, bodyHtml) {
  const safeBrandName = String(brand?.name || PLATFORM_NAME);
  // Logo as <img> when set, styled-text fallback otherwise. The img
  // dimensions cap protect us from oversized files showing as huge in
  // mail clients that don't honor max-width CSS.
  const headerInner = brand?.logoUrl
    ? `<img src="${brand.logoUrl}" alt="${safeBrandName}" style="max-height: 60px; max-width: 240px; display: inline-block;" />`
    : `<h1 style="color: white; margin: 0; font-family: Georgia, 'Times New Roman', serif;">${safeBrandName}</h1>`;

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background-color: ${BRAND_COLOR}; padding: 20px; text-align: center;">
        ${headerInner}
      </div>
      <div style="padding: 30px; background-color: #f9fafb;">
        <h2 style="color: #333;">${title}</h2>
        ${bodyHtml}
      </div>
      <div style="padding: 15px; text-align: center; background-color: #f3f4f6;">
        <p style="color: #aaa; font-size: 12px; margin: 0;">
          ${safeBrandName} &mdash; powered by <a href="${BASE_URL()}" style="color: ${BRAND_COLOR};">Avayble</a>
        </p>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// .ics calendar invite generation
// ---------------------------------------------------------------------------

function generateICS({ summary, description, location, startUTC, endUTC, uid }) {
  // Format: 20260418T170000Z
  const fmt = (d) => DateTime.fromJSDate(d).toUTC().toFormat("yyyyMMdd'T'HHmmss'Z'");
  const now = fmt(new Date());

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Avayble//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${uid}@avayble.app`,
    `DTSTAMP:${now}`,
    `DTSTART:${fmt(startUTC)}`,
    `DTEND:${fmt(endUTC)}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${(description || '').replace(/\n/g, '\\n')}`,
    `LOCATION:${(location || '').replace(/,/g, '\\,')}`,
    'STATUS:CONFIRMED',
    'BEGIN:VALARM',
    'TRIGGER:-PT1H',
    'ACTION:DISPLAY',
    'DESCRIPTION:Reminder',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

// ---------------------------------------------------------------------------
// Helper: build booking details HTML block
// ---------------------------------------------------------------------------

function bookingDetailsHtml(booking, providerName, clientName) {
  const date = booking.localDate;
  const displayDate = DateTime.fromFormat(date, 'yyyy-MM-dd').toFormat('EEEE, MMMM d, yyyy');

  // Format times from 24h to 12h
  const fmtTime = (t) => {
    const [h, m] = t.split(':');
    const dt = DateTime.fromObject({ hour: parseInt(h), minute: parseInt(m) });
    return dt.toFormat('h:mm a');
  };

  const rows = [
    ['Date', displayDate],
    ['Time', `${fmtTime(booking.startTime)} – ${fmtTime(booking.endTime)}`],
    ['Duration', `${booking.duration} minutes`],
    ['Provider', providerName],
    ['Client', clientName],
  ];

  if (booking.location?.address) {
    rows.push(['Location', booking.location.address]);
  }
  if (booking.pricing?.totalPrice) {
    rows.push(['Total', `$${booking.pricing.totalPrice}`]);
  }
  if (booking.paymentMethod) {
    const methods = { cash: 'Cash', zelle: 'Zelle', card: 'Card', package: 'Package credit' };
    const minutesApplied = booking.packageRedemption?.minutesApplied || 0;
    const isPartial =
      minutesApplied > 0 &&
      minutesApplied < (booking.duration || 0) &&
      booking.paymentMethod !== 'package';
    if (isPartial) {
      const uncovered = booking.duration - minutesApplied;
      const owedNote = booking.pricing?.totalPrice
        ? ` ($${(booking.pricing.totalPrice * uncovered / booking.duration).toFixed(2)} due)`
        : '';
      rows.push([
        'Payment',
        `${minutesApplied} min from package + ${uncovered} min via ${methods[booking.paymentMethod] || booking.paymentMethod}${owedNote}`,
      ]);
    } else {
      rows.push(['Payment', methods[booking.paymentMethod] || booking.paymentMethod]);
    }
  }
  if (booking.addons?.length > 0) {
    rows.push(['Add-ons', booking.addons.map((a) => a.name).join(', ')]);
  }

  const rowsHtml = rows
    .map(([label, value]) => `
      <tr>
        <td style="padding: 8px 12px; color: #888; font-size: 14px; white-space: nowrap; vertical-align: top;">${label}</td>
        <td style="padding: 8px 12px; color: #333; font-size: 14px;">${value}</td>
      </tr>
    `)
    .join('');

  return `
    <table style="width: 100%; border-collapse: collapse; margin: 20px 0; background: white; border-radius: 8px; border: 1px solid #e5e7eb;">
      ${rowsHtml}
    </table>
  `;
}

// ---------------------------------------------------------------------------
// Helper: build UTC start/end Date objects from booking
// ---------------------------------------------------------------------------

function bookingToUTCDates(booking) {
  // Use the booking's stored TZ — calendar invite (.ics) start/end
  // need to anchor to where the appointment is, not where the server
  // happens to be configured.
  const bookingTz = booking.timezone || 'America/Los_Angeles';
  const startLA = DateTime.fromFormat(
    `${booking.localDate} ${booking.startTime}`,
    'yyyy-MM-dd HH:mm',
    { zone: bookingTz }
  );
  const endLA = startLA.plus({ minutes: booking.duration });
  return { startUTC: startLA.toUTC().toJSDate(), endUTC: endLA.toUTC().toJSDate() };
}

// ---------------------------------------------------------------------------
// Send helper (wraps Resend with error handling)
// ---------------------------------------------------------------------------

async function sendEmail({ to, subject, html, attachments, brand }) {
  const resend = getResendClient();
  if (!resend) {
    console.warn('Email not sent (Resend not configured):', subject);
    return;
  }

  const fromName = String(brand?.name || PLATFORM_NAME);

  try {
    const payload = {
      from: `${fromName} <${FROM_EMAIL()}>`,
      to,
      subject,
      html,
    };
    if (attachments) payload.attachments = attachments;

    const { error } = await resend.emails.send(payload);
    if (error) {
      console.error('Resend error:', error);
    }
  } catch (err) {
    console.error('Email send failed:', err.message);
  }
}

// ---------------------------------------------------------------------------
// Password Reset (account-level — uses platform Avayble branding)
// ---------------------------------------------------------------------------

const sendPasswordResetEmail = async (toEmail, resetToken) => {
  const resend = getResendClient();
  if (!resend) {
    console.error('Cannot send password reset email: Resend not configured');
    throw new Error('Email service not configured');
  }

  const resetUrl = `${BASE_URL()}/reset-password/${resetToken}`;
  const brand = platformBrand();

  const { error } = await resend.emails.send({
    from: `${brand.name} <${FROM_EMAIL()}>`,
    to: toEmail,
    subject: 'Password Reset Request',
    html: emailWrapper(brand, 'Password Reset', `
      <p style="color: #555; line-height: 1.6;">
        You requested a password reset. Click the button below to set a new password.
        This link will expire in <strong>1 hour</strong>.
      </p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${resetUrl}" style="background-color: ${BRAND_COLOR}; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">
          Reset Password
        </a>
      </div>
      <p style="color: #888; font-size: 14px;">
        If you didn't request this, you can safely ignore this email.
      </p>
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
      <p style="color: #aaa; font-size: 12px;">
        If the button doesn't work, copy and paste this link:<br/>
        <a href="${resetUrl}" style="color: ${BRAND_COLOR};">${resetUrl}</a>
      </p>
    `),
  });

  if (error) {
    console.error('Resend error:', error);
    throw new Error(error.message || 'Failed to send email');
  }
};

// ---------------------------------------------------------------------------
// Booking Confirmation (sent to client on creation)
// ---------------------------------------------------------------------------

async function sendBookingConfirmationEmail(toEmail, booking, provider, clientName) {
  const brand = brandFromProvider(provider);
  const providerName = brand.name;
  const { startUTC, endUTC } = bookingToUTCDates(booking);

  const icsContent = generateICS({
    summary: `Massage with ${providerName}`,
    description: `${booking.duration} minute massage at ${booking.location?.address || 'TBD'}`,
    location: booking.location?.address || '',
    startUTC,
    endUTC,
    uid: booking._id.toString(),
  });

  const bookingsUrl = `${BASE_URL()}/my-bookings`;

  await sendEmail({
    to: toEmail,
    brand,
    subject: `Booking Confirmed — ${DateTime.fromFormat(booking.localDate, 'yyyy-MM-dd').toFormat('EEE, MMM d')} at ${DateTime.fromFormat(booking.startTime, 'HH:mm').toFormat('h:mm a')}`,
    html: emailWrapper(brand, 'Booking Confirmed', `
      <p style="color: #555; line-height: 1.6;">
        Your appointment with <strong>${providerName}</strong> has been booked!
      </p>
      ${bookingDetailsHtml(booking, providerName, clientName)}
      <div style="text-align: center; margin: 30px 0;">
        <a href="${bookingsUrl}" style="background-color: ${BRAND_COLOR}; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">
          View My Bookings
        </a>
      </div>
      <p style="color: #888; font-size: 13px;">
        A calendar invite is attached — add it to your calendar so you don't forget!
      </p>
    `),
    attachments: [
      {
        filename: 'appointment.ics',
        content: Buffer.from(icsContent).toString('base64'),
        type: 'text/calendar',
      },
    ],
  });
}

// ---------------------------------------------------------------------------
// Booking Notification to Provider (sent when client books)
// ---------------------------------------------------------------------------

async function sendBookingNotificationToProvider(toEmail, booking, provider, clientName) {
  const brand = brandFromProvider(provider);
  const providerName = brand.name;
  const appointmentsUrl = `${BASE_URL()}/provider/appointments`;

  await sendEmail({
    to: toEmail,
    brand,
    subject: `New Booking — ${clientName} on ${DateTime.fromFormat(booking.localDate, 'yyyy-MM-dd').toFormat('EEE, MMM d')}`,
    html: emailWrapper(brand, 'New Booking', `
      <p style="color: #555; line-height: 1.6;">
        You have a new appointment booked.
      </p>
      ${bookingDetailsHtml(booking, providerName, clientName)}
      <div style="text-align: center; margin: 30px 0;">
        <a href="${appointmentsUrl}" style="background-color: ${BRAND_COLOR}; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">
          View Appointments
        </a>
      </div>
    `),
  });
}

// ---------------------------------------------------------------------------
// Booking Cancellation (sent to the OTHER party)
// ---------------------------------------------------------------------------

async function sendBookingCancellationEmail(toEmail, booking, provider, clientName, cancelledBy) {
  const brand = brandFromProvider(provider);
  const providerName = brand.name;
  const cancelledByLabel = cancelledBy === 'CLIENT' ? clientName : providerName;
  const displayDate = DateTime.fromFormat(booking.localDate, 'yyyy-MM-dd').toFormat('EEEE, MMMM d, yyyy');
  const fmtTime = (t) => DateTime.fromFormat(t, 'HH:mm').toFormat('h:mm a');

  await sendEmail({
    to: toEmail,
    brand,
    subject: `Booking Cancelled — ${DateTime.fromFormat(booking.localDate, 'yyyy-MM-dd').toFormat('EEE, MMM d')}`,
    html: emailWrapper(brand, 'Booking Cancelled', `
      <p style="color: #555; line-height: 1.6;">
        The following appointment has been cancelled by <strong>${cancelledByLabel}</strong>.
      </p>
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0; background: white; border-radius: 8px; border: 1px solid #e5e7eb;">
        <tr>
          <td style="padding: 8px 12px; color: #888; font-size: 14px;">Date</td>
          <td style="padding: 8px 12px; color: #333; font-size: 14px; text-decoration: line-through;">${displayDate}</td>
        </tr>
        <tr>
          <td style="padding: 8px 12px; color: #888; font-size: 14px;">Time</td>
          <td style="padding: 8px 12px; color: #333; font-size: 14px; text-decoration: line-through;">${fmtTime(booking.startTime)} – ${fmtTime(booking.endTime)}</td>
        </tr>
      </table>
      <p style="color: #888; font-size: 14px;">
        If you'd like to rebook with ${providerName}, please visit <a href="${BASE_URL()}" style="color: ${BRAND_COLOR};">your bookings page</a>.
      </p>
    `),
  });
}

// ---------------------------------------------------------------------------
// Booking Completed (receipt sent to client)
// ---------------------------------------------------------------------------

async function sendBookingCompletedEmail(toEmail, booking, provider, clientName) {
  const brand = brandFromProvider(provider);
  const providerName = brand.name;

  await sendEmail({
    to: toEmail,
    brand,
    subject: `Session Complete — Thank you, ${clientName.split(' ')[0]}!`,
    html: emailWrapper(brand, 'Session Complete', `
      <p style="color: #555; line-height: 1.6;">
        Thanks for your session with <strong>${providerName}</strong>! Here's your receipt.
      </p>
      ${bookingDetailsHtml(booking, providerName, clientName)}
      <p style="color: #888; font-size: 14px;">
        We hope you enjoyed your appointment. <a href="${BASE_URL()}/book" style="color: ${BRAND_COLOR};">Book your next session</a>.
      </p>
    `),
  });
}

module.exports = {
  sendPasswordResetEmail,
  sendBookingConfirmationEmail,
  sendBookingNotificationToProvider,
  sendBookingCancellationEmail,
  sendBookingCompletedEmail,
};
