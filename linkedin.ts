import { API_BASE, LINKEDIN_VERSION } from "./config.js";
import { getValidAccessToken } from "./tokens.js";

const enc = encodeURIComponent;

export class LinkedInError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown
  ) {
    super(message);
  }
}

async function request(
  path: string,
  extraHeaders: Record<string, string> = {}
): Promise<unknown> {
  const token = await getValidAccessToken();
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "LinkedIn-Version": LINKEDIN_VERSION,
      "X-Restli-Protocol-Version": "2.0.0",
      ...extraHeaders,
    },
  });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* keep raw text */
  }
  if (!res.ok) {
    let hint = "";
    if (res.status === 401) hint = " Token invalid or expired: run `npm run auth`.";
    else if (res.status === 403)
      hint =
        " Not allowed: the authorizing member must be an ADMINISTRATOR of the Page, and your LinkedIn app needs the Community Management API product approved.";
    else if (res.status === 426 || res.status === 400)
      hint = ` Check LINKEDIN_VERSION (currently ${LINKEDIN_VERSION}); LinkedIn retires old versions.`;
    throw new LinkedInError(
      res.status,
      `LinkedIn API ${res.status} on ${path.split("?")[0]}.${hint}`,
      body
    );
  }
  return body;
}

export const orgUrn = (idOrUrn: string): string =>
  idOrUrn.startsWith("urn:") ? idOrUrn : `urn:li:organization:${idOrUrn}`;

/** Organizations the authorized member administers. */
export function listAdminOrgs() {
  return request("/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED");
}

/** Posts authored by an organization, newest first. */
export function listOrgPosts(org: string, count = 10, start = 0) {
  return request(
    `/posts?q=author&author=${enc(orgUrn(org))}&count=${count}&start=${start}&sortBy=LAST_MODIFIED`,
    { "X-RestLi-Method": "FINDER" }
  );
}

export interface TimeRange {
  startMs: number;
  endMs: number;
  granularity: "DAY" | "MONTH";
}

function timeIntervals(t: TimeRange): string {
  return `&timeIntervals=${enc(
    `(timeRange:(start:${t.startMs},end:${t.endMs}),timeGranularityType:${t.granularity})`
  )}`;
}

/** Organic share statistics: lifetime, or time-bound (last 12 months only). */
export function orgShareStatistics(org: string, time?: TimeRange) {
  return request(
    `/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=${enc(
      orgUrn(org)
    )}${time ? timeIntervals(time) : ""}`
  );
}

/** Statistics for specific posts. Pass urn:li:share:... and/or urn:li:ugcPost:... URNs. */
export function postStatistics(org: string, postUrns: string[]) {
  const shares = postUrns.filter((u) => u.startsWith("urn:li:share:"));
  const ugc = postUrns.filter((u) => u.startsWith("urn:li:ugcPost:"));
  if (shares.length + ugc.length !== postUrns.length) {
    throw new Error("Post URNs must start with urn:li:share: or urn:li:ugcPost:");
  }
  let q = `/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=${enc(
    orgUrn(org)
  )}`;
  if (shares.length) q += `&shares=List(${shares.map(enc).join(",")})`;
  ugc.forEach((u, i) => (q += `&ugcPosts[${i}]=${enc(u)}`));
  return request(q);
}

/** Live like/comment counts for one post (matches the LinkedIn feed). */
export function socialActions(postUrn: string) {
  return request(`/socialActions/${enc(postUrn)}`);
}

/** Follower statistics: lifetime breakdowns, or time-bound gains. */
export function orgFollowerStatistics(org: string, time?: TimeRange) {
  return request(
    `/organizationalEntityFollowerStatistics?q=organizationalEntity&organizationalEntity=${enc(
      orgUrn(org)
    )}${time ? timeIntervals(time) : ""}`
  );
}
