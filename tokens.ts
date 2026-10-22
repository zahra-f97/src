import { mkdir, readFile, writeFile, chmod } from "node:fs/promises";
import { dirname } from "node:path";
import { TOKEN_FILE } from "./config.js";

export interface StoredTokens {
  access_token: string;
  expires_at: number; // epoch ms
  scope?: string;
  refresh_token?: string;
  refresh_token_expires_at?: number;
}

export async function loadTokens(): Promise<StoredTokens | null> {
  // Allow a token supplied directly via env (useful for hosted/CI use).
  if (process.env.LINKEDIN_ACCESS_TOKEN) {
    return {
      access_token: process.env.LINKEDIN_ACCESS_TOKEN,
      expires_at: Number.MAX_SAFE_INTEGER,
    };
  }
  try {
    return JSON.parse(await readFile(TOKEN_FILE, "utf8")) as StoredTokens;
  } catch {
    return null;
  }
}

export async function saveTokens(tokens: StoredTokens): Promise<void> {
  await mkdir(dirname(TOKEN_FILE), { recursive: true });
  await writeFile(TOKEN_FILE, JSON.stringify(tokens, null, 2), "utf8");
  try {
    await chmod(TOKEN_FILE, 0o600);
  } catch {
    /* best effort on platforms without chmod */
  }
}

export async function getValidAccessToken(): Promise<string> {
  const t = await loadTokens();
  if (!t) {
    throw new Error(
      "No LinkedIn token found. Run `npm run auth` once to authorize (see README)."
    );
  }
  if (Date.now() > t.expires_at - 60_000) {
    throw new Error(
      "LinkedIn access token has expired (they last about 60 days). Run `npm run auth` again to re-authorize."
    );
  }
  return t.access_token;
}
