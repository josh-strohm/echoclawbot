/**
 * scripts/auth.ts — Helper script to get a Google Refresh Token.
 *
 * Usage:
 *   1. Fill in GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI in .env
 *   2. Run: npx tsx src/scripts/auth.ts
 *   3. Follow the instructions in the terminal.
 */

import "dotenv/config";
import { google } from "googleapis";
import {
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI,
} from "../config.js";

async function getRefreshToken() {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
        console.error("❌ Missing required Google credentials in .env");
        console.log("Required: CLIENT_ID, CLIENT_SECRET, REDIRECT_URI");
        process.exit(1);
    }

    const oauth2Client = new google.auth.OAuth2(
        GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET,
        GOOGLE_REDIRECT_URI
    );

    const authUrl = oauth2Client.generateAuthUrl({
        access_type: "offline", // This is what gives us the refresh token
        prompt: "consent",      // Required to get a refresh token every time
        scope: ["https://www.googleapis.com/auth/gmail.modify"],
    });

    console.log("\n🚀 --- GOOGLE AUTHENTICATION ---");
    console.log("1. Open this URL in your browser:");
    console.log(`\n${authUrl}\n`);
    console.log("2. Authorize the app.");
    console.log("3. After you are redirected, copy the 'code' parameter from the URL.");

    const readline = await import("readline");
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    rl.question("\n4. Paste the 'code' here: ", async (code) => {
        try {
            const { tokens } = await oauth2Client.getToken(code);
            console.log("\n✅ Success!");
            console.log("--- REFRESH TOKEN ---");
            console.log(tokens.refresh_token);
            console.log("----------------------");
            console.log("\nCopy this token into your .env as GOOGLE_REFRESH_TOKEN.");
        } catch (err) {
            console.error("\n❌ Failed to get tokens:", (err as any).message);
        }
        rl.close();
    });
}

getRefreshToken();
