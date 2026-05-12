const { google } = require('googleapis');
const crypto = require('crypto');

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/userinfo.email'
];

function buildOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

function getAuthUrl(state) {
  const oauth2Client = buildOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    state
  });
}

async function exchangeCode(code) {
  const oauth2Client = buildOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
}

async function getAuthenticatedClient(provider) {
  const gcal = provider.providerProfile.googleCalendar;
  const oauth2Client = buildOAuth2Client();

  oauth2Client.setCredentials({
    access_token: gcal.accessToken,
    refresh_token: gcal.refreshToken,
    expiry_date: gcal.tokenExpiry ? gcal.tokenExpiry.getTime() : null
  });

  // Persist refreshed tokens automatically. WRAPPED IN TRY/CATCH —
  // the previous version's unhandled throw inside this async callback
  // (e.g. FIELD_ENCRYPTION_KEY missing → encryption setter throws)
  // surfaced as an unhandled promise rejection and crashed the entire
  // dyno. A token-persistence failure is not worth taking down the
  // app; log and keep serving requests, even if subsequent calls have
  // to re-refresh.
  oauth2Client.on('tokens', async (tokens) => {
    if (!tokens.access_token) return;
    try {
      gcal.accessToken = tokens.access_token;
      gcal.tokenExpiry = new Date(tokens.expiry_date);
      await provider.save();
    } catch (err) {
      console.error(`[GCal] Failed to persist refreshed token for ${provider.email}: ${err.message}`);
      // Don't rethrow — this callback runs detached from any request's
      // promise chain, so a throw here can't be caught upstream.
    }
  });

  return oauth2Client;
}

async function getUserEmail(oauth2Client) {
  const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
  const { data } = await oauth2.userinfo.get();
  return data.email;
}

async function listCalendars(provider) {
  const auth = await getAuthenticatedClient(provider);
  const calendar = google.calendar({ version: 'v3', auth });
  const { data } = await calendar.calendarList.list();
  return (data.items || []).map(cal => ({
    id: cal.id,
    summary: cal.summary,
    primary: cal.primary || false,
    backgroundColor: cal.backgroundColor
  }));
}

async function createWatchChannel(provider, calendarId) {
  const auth = await getAuthenticatedClient(provider);
  const calendar = google.calendar({ version: 'v3', auth });

  const channelId = crypto.randomUUID();
  const webhookUrl = `${process.env.REACT_APP_API_URL || process.env.GOOGLE_REDIRECT_URI.replace('/api/google-calendar/oauth/callback', '')}/api/google-calendar/webhook`;

  const { data } = await calendar.events.watch({
    calendarId,
    requestBody: {
      id: channelId,
      type: 'web_hook',
      address: webhookUrl,
      token: process.env.GOOGLE_WEBHOOK_SECRET,
      params: { ttl: '604800' } // 7 days
    }
  });

  const gcal = provider.providerProfile.googleCalendar;
  gcal.watchChannels.set(calendarId, {
    channelId,
    resourceId: data.resourceId,
    expiration: new Date(parseInt(data.expiration))
  });
  await provider.save();

  console.log(`[GCal] Watch channel created for provider ${provider.email}, calendar ${calendarId}, expires ${new Date(parseInt(data.expiration)).toISOString()}`);
  return { channelId, resourceId: data.resourceId };
}

async function stopWatchChannel(provider, calendarId) {
  const gcal = provider.providerProfile.googleCalendar;
  const channel = gcal.watchChannels.get(calendarId);
  if (!channel) return;

  try {
    const auth = await getAuthenticatedClient(provider);
    const calendar = google.calendar({ version: 'v3', auth });
    await calendar.channels.stop({
      requestBody: {
        id: channel.channelId,
        resourceId: channel.resourceId
      }
    });
    console.log(`[GCal] Watch channel stopped for provider ${provider.email}, calendar ${calendarId}`);
  } catch (err) {
    // Channel may have already expired — that's fine
    console.log(`[GCal] Stop channel warning (may be expired): ${err.message}`);
  }

  gcal.watchChannels.delete(calendarId);
  await provider.save();
}

async function fetchEvents(provider, calendarId, syncToken = null) {
  const auth = await getAuthenticatedClient(provider);
  const calendar = google.calendar({ version: 'v3', auth });

  const params = {
    calendarId,
    singleEvents: true,
    maxResults: 2500
  };

  if (syncToken) {
    // Incremental sync
    params.syncToken = syncToken;
  } else {
    // Full sync — next 30 days
    const now = new Date();
    const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    params.timeMin = now.toISOString();
    params.timeMax = thirtyDaysLater.toISOString();
    params.showDeleted = false;
  }

  let allEvents = [];
  let nextPageToken = null;
  let nextSyncToken = null;
  let pageCount = 0;
  const MAX_PAGES = 20; // Safety cap: 20 pages × 2500 events = 50k events max

  do {
    if (pageCount >= MAX_PAGES) {
      console.warn(`[GCal] Hit max page limit (${MAX_PAGES}) fetching events for ${provider.email}, calendar ${calendarId}`);
      break;
    }
    pageCount++;
    try {
      if (nextPageToken) params.pageToken = nextPageToken;
      const { data } = await calendar.events.list(params);
      allEvents = allEvents.concat(data.items || []);
      nextPageToken = data.nextPageToken;
      nextSyncToken = data.nextSyncToken;
    } catch (err) {
      if (err.code === 410) {
        // Sync token invalidated — need a full sync
        console.log(`[GCal] Sync token expired for provider ${provider.email}, calendar ${calendarId}. Triggering full sync.`);
        return { events: null, nextSyncToken: null, fullSyncRequired: true };
      }
      throw err;
    }
  } while (nextPageToken);

  return { events: allEvents, nextSyncToken, fullSyncRequired: false };
}

module.exports = {
  buildOAuth2Client,
  getAuthUrl,
  exchangeCode,
  getAuthenticatedClient,
  getUserEmail,
  listCalendars,
  createWatchChannel,
  stopWatchChannel,
  fetchEvents
};
