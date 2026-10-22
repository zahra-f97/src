import { homedir } from "node:os";
import { join } from "node:path";

// LinkedIn REST API version header (YYYYMM). LinkedIn sunsets old versions on a rolling basis,
// so this is configurable. Default is the current version at build time.
export const LINKEDIN_VERSION = process.env.LINKEDIN_VERSION ?? "202610";

export const API_BASE = process.env.LINKEDIN_API_BASE ?? "https://api.linkedin.com/rest";
export const AUTH_URL = "https://www.linkedin.com/oauth/v2/authorization";
export const TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";

export const CLIENT_ID = process.env.LINKEDIN_CLIENT_ID ?? "";
export const CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET ?? "";
export const REDIRECT_URI =
  process.env.LINKEDIN_REDIRECT_URI ?? "http://localhost:8765/callback";

// Scopes needed for organic Page analytics and posts on Pages you administer.
export const SCOPES = (
  process.env.LINKEDIN_SCOPES ??
  "r_organization_social rw_organization_admin r_organization_admin"
).split(/\s+/);

export const TOKEN_FILE =
  process.env.LINKEDIN_TOKEN_FILE ?? join(homedir(), ".linkedin-mcp", "tokens.json");
