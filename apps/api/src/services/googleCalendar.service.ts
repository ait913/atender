import { buildUrl, googleFetchJson } from "../lib/googleApi";

export type GoogleCalendarListItem = {
  id: string;
  summary: string;
  timeZone: string;
  accessRole: "owner" | "writer" | "reader" | "freeBusyReader";
  primary?: boolean;
  selected?: boolean;
  backgroundColor?: string;
};

export type GoogleEvent = {
  id: string;
  iCalUID?: string;
  status?: "confirmed" | "tentative" | "cancelled";
  summary?: string;
  description?: string;
  start?: { date?: string; dateTime?: string; timeZone?: string };
  end?: { date?: string; dateTime?: string; timeZone?: string };
  recurringEventId?: string;
  originalStartTime?: { date?: string; dateTime?: string };
  updated?: string;
  visibility?: "default" | "public" | "private" | "confidential";
};

export async function listGoogleCalendars(accessToken: string): Promise<GoogleCalendarListItem[]> {
  const items: GoogleCalendarListItem[] = [];
  let pageToken: string | undefined;
  do {
    const data = await googleFetchJson<{ items?: GoogleCalendarListItem[]; nextPageToken?: string }>({
      accessToken,
      url: buildUrl("/calendar/v3/users/me/calendarList", { pageToken, maxResults: 250 }),
    });
    items.push(...(data.items ?? []));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return items;
}

export type EventsListResult = {
  events: GoogleEvent[];
  nextSyncToken: string | null;
};

export async function listGoogleEvents(args: {
  accessToken: string;
  calendarId: string;
  syncToken?: string | null;
  timeMin?: Date;
  timeMax?: Date;
}): Promise<EventsListResult> {
  const allEvents: GoogleEvent[] = [];
  let pageToken: string | undefined;
  let nextSyncToken: string | null = null;

  do {
    const query: Record<string, string | number | undefined> = { maxResults: 2500, pageToken };
    if (args.syncToken) {
      query.syncToken = args.syncToken;
    } else {
      query.singleEvents = "true";
      query.orderBy = "startTime";
      if (args.timeMin) query.timeMin = args.timeMin.toISOString();
      if (args.timeMax) query.timeMax = args.timeMax.toISOString();
    }

    const data = await googleFetchJson<{ items?: GoogleEvent[]; nextPageToken?: string; nextSyncToken?: string }>({
      accessToken: args.accessToken,
      url: buildUrl(`/calendar/v3/calendars/${encodeURIComponent(args.calendarId)}/events`, query),
    });
    allEvents.push(...(data.items ?? []));
    pageToken = data.nextPageToken;
    if (data.nextSyncToken) nextSyncToken = data.nextSyncToken;
  } while (pageToken);

  return { events: allEvents, nextSyncToken };
}

export type GoogleUserInfo = {
  email: string;
  email_verified: boolean;
  name?: string;
};

export async function fetchGoogleUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  return googleFetchJson<GoogleUserInfo>({
    accessToken,
    url: "https://www.googleapis.com/oauth2/v3/userinfo",
  });
}
