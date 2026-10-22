// Offline self-test: runs the MCP server over stdio against a mock LinkedIn API.
// `npm run build && npm test`
import { createServer } from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const seen: { url: string; headers: Record<string, string | string[] | undefined> }[] = [];

const mock = createServer((req, res) => {
  seen.push({ url: req.url ?? "", headers: req.headers });
  res.setHeader("Content-Type", "application/json");
  if (req.headers.authorization !== "Bearer testtoken") {
    res.writeHead(401).end(JSON.stringify({ message: "bad token" }));
    return;
  }
  if ((req.url ?? "").includes("/organizationalEntityFollowerStatistics")) {
    res.writeHead(403).end(JSON.stringify({ message: "forbidden" }));
    return;
  }
  res.writeHead(200).end(JSON.stringify({ elements: [{ ok: true, url: req.url }] }));
});
await new Promise<void>((r) => mock.listen(0, "127.0.0.1", r));
const port = (mock.address() as { port: number }).port;

const here = dirname(fileURLToPath(import.meta.url));
const client = new Client({ name: "selftest", version: "0" });
await client.connect(
  new StdioClientTransport({
    command: process.execPath,
    args: [join(here, "index.js")],
    env: {
      ...process.env,
      LINKEDIN_API_BASE: `http://127.0.0.1:${port}/rest`,
      LINKEDIN_ACCESS_TOKEN: "testtoken",
      LINKEDIN_VERSION: "202610",
    } as Record<string, string>,
  })
);

let failures = 0;
const check = (name: string, ok: boolean, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name} ${extra}`);
  if (!ok) failures++;
};

const tools = (await client.listTools()).tools.map((t) => t.name).sort();
check("lists 6 tools", tools.length === 6, tools.join(", "));

const text = (r: unknown) =>
  ((r as { content: { text: string }[] }).content[0]?.text ?? "") as string;

let r = await client.callTool({ name: "linkedin_list_admin_orgs", arguments: {} });
check("admin orgs ok", !r.isError);
check(
  "admin orgs URL",
  seen.at(-1)!.url === "/rest/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED",
  seen.at(-1)!.url
);
check("version header sent", seen.at(-1)!.headers["linkedin-version"] === "202610");
check("restli header sent", seen.at(-1)!.headers["x-restli-protocol-version"] === "2.0.0");

r = await client.callTool({
  name: "linkedin_list_org_posts",
  arguments: { organization: "12345", count: 5 },
});
check("posts ok", !r.isError);
check(
  "posts URL encodes URN",
  seen.at(-1)!.url.includes("author=urn%3Ali%3Aorganization%3A12345") &&
    seen.at(-1)!.url.includes("count=5"),
  seen.at(-1)!.url
);

r = await client.callTool({
  name: "linkedin_org_share_statistics",
  arguments: {
    organization: "12345",
    range: { start_date: "2026-09-01", end_date: "2026-10-01", granularity: "DAY" },
  },
});
check("time-bound stats ok", !r.isError);
check(
  "timeIntervals encoded",
  seen.at(-1)!.url.includes("timeIntervals=") &&
    decodeURIComponent(seen.at(-1)!.url).includes(
      "(timeRange:(start:1788220800000,end:1790812800000),timeGranularityType:DAY)"
    ),
  decodeURIComponent(seen.at(-1)!.url)
);

r = await client.callTool({
  name: "linkedin_post_statistics",
  arguments: { organization: "12345", post_urns: ["urn:li:share:1", "urn:li:ugcPost:2"] },
});
check("post stats ok", !r.isError);
const u = decodeURIComponent(seen.at(-1)!.url);
check("shares List() + ugcPosts[0]", u.includes("shares=List(urn:li:share:1)") && u.includes("ugcPosts[0]=urn:li:ugcPost:2"), u);

r = await client.callTool({
  name: "linkedin_post_statistics",
  arguments: { organization: "12345", post_urns: ["bogus"] },
});
check("rejects bad URN", r.isError === true, text(r).slice(0, 80));

r = await client.callTool({
  name: "linkedin_org_share_statistics",
  arguments: {
    organization: "12345",
    range: { start_date: "2026-10-01", end_date: "2026-09-01", granularity: "DAY" },
  },
});
check("rejects reversed dates", r.isError === true, text(r).slice(0, 80));

r = await client.callTool({
  name: "linkedin_org_follower_statistics",
  arguments: { organization: "12345" },
});
check("403 surfaces helpful error", r.isError === true && text(r).includes("ADMINISTRATOR"), text(r).slice(0, 100));

await client.close();
mock.close();
console.log(failures ? `\n${failures} FAILED` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
