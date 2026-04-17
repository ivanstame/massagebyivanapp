const { google } = require('googleapis');
const { v4: uuidv4 } = require('uuid');

const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];

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

  // Persist refreshed tokens automatically
  oauth2Client.on('tokens', async (tokens) => {
    if (tokens.access_token) {
      gcal.accessToken = tokens.access_token;
      gcal.tokenExpiry = new Date(tokens.expiry_date);
      await provider.save();
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

  const channelId = uuidv4();
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

  do {
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
