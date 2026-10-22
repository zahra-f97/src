// One-time OAuth helper: `npm run auth`
// Starts a tiny local server, prints the LinkedIn authorize URL, exchanges the code for a token,
// and stores it in ~/.linkedin-mcp/tokens.json (mode 600).
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import {
  AUTH_URL,
  TOKEN_URL,
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI,
  SCOPES,
  TOKEN_FILE,
} from "./config.js";
import { saveTokens } from "./tokens.js";

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Set LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET first (see .env.example).");
  process.exit(1);
}

const redirect = new URL(REDIRECT_URI);
const state = randomBytes(16).toString("hex");

const authorizeUrl =
  `${AUTH_URL}?response_type=code` +
  `&client_id=${encodeURIComponent(CLIENT_ID)}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
  `&state=${state}` +
  `&scope=${encodeURIComponent(SCOPES.join(" "))}`;

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", REDIRECT_URI);
  if (url.pathname !== redirect.pathname) {
    res.writeHead(404).end("Not found");
    return;
  }
  const err = url.searchParams.get("error");
  if (err) {
    res.writeHead(400).end(`LinkedIn returned an error: ${err} ${url.searchParams.get("error_description") ?? ""}`);
    console.error("Authorization failed:", err);
    server.close();
    process.exit(1);
  }
  if (url.searchParams.get("state") !== state) {
    res.writeHead(401).end("State mismatch");
    return;
  }
  const code = url.searchParams.get("code");
  if (!code) {
    res.writeHead(400).end("Missing code");
    return;
  }
  try {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
    });
    const r = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const json = (await r.json()) as Record<string, unknown>;
    if (!r.ok || typeof json.access_token !== "string") {
      throw new Error(`Token exchange failed: ${JSON.stringify(json)}`);
    }
    const now = Date.now();
    await saveTokens({
      access_token: json.access_token,
      expires_at: now + Number(json.expires_in ?? 5184000) * 1000,
      scope: typeof json.scope === "string" ? json.scope : undefined,
      refresh_token: typeof json.refresh_token === "string" ? json.refresh_token : undefined,
      refresh_token_expires_at: json.refresh_token_expires_in
        ? now + Number(json.refresh_token_expires_in) * 1000
        : undefined,
    });
    res.writeHead(200, { "Content-Type": "text/plain" }).end("LinkedIn connected. You can close this tab.");
    console.log(`Saved token to ${TOKEN_FILE}`);
    server.close();
    process.exit(0);
  } catch (e) {
    res.writeHead(500).end("Token exchange failed, see terminal.");
    console.error(e);
    server.close();
    process.exit(1);
  }
});

server.listen(Number(redirect.port || 80), redirect.hostname, () => {
  console.log("Open this URL in your browser and approve access:\n");
  console.log(authorizeUrl + "\n");
  console.log(`Waiting for the redirect on ${REDIRECT_URI} ...`);
});
