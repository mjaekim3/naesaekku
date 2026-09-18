import { resolve } from "node:path";
import { Studio } from "../core/studio.mjs";
import { createGateway } from "./gateway.mjs";
if (!process.env.OPENAI_API_KEY || !process.env.ONGI_GATEWAY_TOKEN)
  throw Error(
    "Set OPENAI_API_KEY and ONGI_GATEWAY_TOKEN in the server environment.",
  );
const studio = await Studio.open({
  dir: resolve(process.env.ONGI_DATA_DIR || ".local-data"),
});
const server = await createGateway({
  studio,
  token: process.env.ONGI_GATEWAY_TOKEN,
  port: Number(process.env.PORT || 8787),
});
console.log(`Private Ongi gateway: ${server.url}`);
