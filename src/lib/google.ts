/**
 * lib/google.ts — Google OAuth2 & Gmail client setup.
 *
 * Uses the Client ID, Client Secret, and Refresh Token from .env
 * to create an authenticated Gmail client.
 */

import { google } from "googleapis";
import {
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI,
    GOOGLE_REFRESH_TOKEN,
} from "../config.js";
import { logger } from "../logger.js";

/**
 * Check if the core Google credentials are provided.
 */
export function hasGoogleConfig(): boolean {
    return !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET && GOOGLE_REFRESH_TOKEN);
}

const oauth2Client = hasGoogleConfig()
    ? new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI)
    : null;

if (oauth2Client) {
    oauth2Client.setCredentials({
        refresh_token: GOOGLE_REFRESH_TOKEN,
    });
    logger.info("google", "Google OAuth client initialized with refresh token");
} else {
    logger.warn("google", "Google credentials missing. Gmail and Calendar tools will be disabled.");
}

/**
 * Get an authenticated Gmail client instance.
 */
export function getGmail() {
    if (!oauth2Client) {
        throw new Error("Gmail is not configured. Please add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN to your .env");
    }
    return google.gmail({ version: "v1", auth: oauth2Client });
}

/**
 * Get an authenticated Google Calendar client instance.
 */
export function getCalendar() {
    if (!oauth2Client) {
        throw new Error("Google is not configured. Please add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN to your .env");
    }
    return google.calendar({ version: "v3", auth: oauth2Client });
}

/**
 * Get the OAuth2 client for other Google services (like Pub/Sub).
 */
export function getGoogleAuth() {
    return oauth2Client;
}
