import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as li from "./linkedin.js";

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

async function run(fn: () => Promise<unknown>): Promise<ToolResult> {
  try {
    const data = await fn();
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  } catch (e) {
    const err = e as li.LinkedInError;
    const detail = err.body ? `\n${JSON.stringify(err.body)}` : "";
    return {
      isError: true,
      content: [{ type: "text", text: `${err.message}${detail}` }],
    };
  }
}

const orgParam = z
  .string()
  .describe("LinkedIn organization ID (numeric) or full urn:li:organization:ID");

const dayRange = z.object({
  start_date: z.string().describe("YYYY-MM-DD, inclusive. Must be within the last 12 months."),
  end_date: z.string().describe("YYYY-MM-DD, exclusive."),
  granularity: z.enum(["DAY", "MONTH"]).default("DAY"),
});

function toRange(r: z.infer<typeof dayRange>): li.TimeRange {
  const startMs = Date.parse(`${r.start_date}T00:00:00Z`);
  const endMs = Date.parse(`${r.end_date}T00:00:00Z`);
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) {
    throw new Error("Invalid date range: use YYYY-MM-DD and end_date after start_date.");
  }
  return { startMs, endMs, granularity: r.granularity };
}

export function buildServer(): McpServer {
  const server = new McpServer({ name: "linkedin-mcp", version: "0.1.0" });

  server.registerTool(
    "linkedin_list_admin_orgs",
    {
      description:
        "List LinkedIn organizations (Company Pages) the authorized member administers. Use this first to find the organization ID for the other tools.",
      inputSchema: {},
    },
    () => run(() => li.listAdminOrgs())
  );

  server.registerTool(
    "linkedin_list_org_posts",
    {
      description:
        "List recent posts authored by a LinkedIn organization Page you administer, newest first. Returns post URNs you can pass to the statistics tools.",
      inputSchema: {
        organization: orgParam,
        count: z.number().int().min(1).max(100).default(10),
        start: z.number().int().min(0).default(0).describe("Paging offset"),
      },
    },
    ({ organization, count, start }) => run(() => li.listOrgPosts(organization, count, start))
  );

  server.registerTool(
    "linkedin_org_share_statistics",
    {
      description:
        "Organic engagement totals for an organization's posts (impressions, unique impressions, clicks, likes, comments, shares, engagement rate). Omit the date range for lifetime totals. Time-bound data covers only the last 12 months.",
      inputSchema: { organization: orgParam, range: dayRange.optional() },
    },
    ({ organization, range }) =>
      run(() => li.orgShareStatistics(organization, range ? toRange(range) : undefined))
  );

  server.registerTool(
    "linkedin_post_statistics",
    {
      description:
        "Organic statistics for specific posts (lifetime only). Pass post URNs of the form urn:li:share:... or urn:li:ugcPost:... from linkedin_list_org_posts. Posts with no activity are omitted and count as zero.",
      inputSchema: {
        organization: orgParam,
        post_urns: z.array(z.string()).min(1).max(20),
      },
    },
    ({ organization, post_urns }) => run(() => li.postStatistics(organization, post_urns))
  );

  server.registerTool(
    "linkedin_post_social_actions",
    {
      description:
        "Live like and comment counts for one post, matching what the LinkedIn feed shows. Use when statistics lag.",
      inputSchema: { post_urn: z.string().describe("e.g. urn:li:share:123 or urn:li:ugcPost:123") },
    },
    ({ post_urn }) => run(() => li.socialActions(post_urn))
  );

  server.registerTool(
    "linkedin_org_follower_statistics",
    {
      description:
        "Follower statistics for an organization Page: lifetime breakdowns (seniority, industry, function, geography) or time-bound follower gains.",
      inputSchema: { organization: orgParam, range: dayRange.optional() },
    },
    ({ organization, range }) =>
      run(() => li.orgFollowerStatistics(organization, range ? toRange(range) : undefined))
  );

  return server;
}
