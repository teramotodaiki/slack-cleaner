const { WebClient } = require("@slack/web-api");
const { config } = require("dotenv");
const { promises: fs } = require("fs");
const prompt = require("prompts");

main()
  .then(() => console.log("finished"))
  .catch((err) => console.error(err));

async function main() {
  config();
  const token = process.env.SLACK_TOKEN;
  if (!token) throw new Error("SLACK_TOKEN is not set");

  const client = new WebClient(token, { retryConfig: { minTimeout: 5000 } });

  const { query } = await prompt({
    type: "text",
    name: "query",
    message: "Enter a query to search for",
  });

  const filename = `./backup/${new Date().toISOString()}.json`;
  let total = 0;

  await fs.appendFile(filename, JSON.stringify({ query }) + "\n");

  for (let page = 1; page < 1000; page++) {
    const result = await client.search.messages({
      query,
      sort: "timestamp",
      sort_dir: "asc",
      page,
    });
    if (result.error) {
      console.log(result);
      throw new Error(result.error);
    }
    for (const match of result.messages.matches) {
      const { channel, text, user, ts } = match;
      const json = JSON.stringify({ channel, text, user, ts });
      await fs.appendFile(filename, json + "\n");
    }

    if (page >= result.messages.pagination.page_count) {
      total = result.messages.pagination.total_count;
      break; // 終了
    }
  }
  if (total === 0) {
    throw new Error("No messages found");
  }

  console.log(`Backup ${total} messages in ${filename}`);
  const { conrimed } = await prompt({
    type: "confirm",
    name: "conrimed",
    message: `Are you sure to delete ${total} messages?`,
    initial: false,
  });
  if (!conrimed) return;

  const jsonl = await fs.readFile(filename, "utf8");
  for (const json of jsonl.split("\n").filter((s) => s)) {
    const { ts, channel } = JSON.parse(json);
    if (typeof ts !== "string") continue;
    if (typeof channel.id !== "string") continue;
    await client.chat.delete({ ts, channel: channel.id });
  }

  console.log("deleted");
}
