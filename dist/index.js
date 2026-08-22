import {
  server
} from "./chunk-VKYDKRCK.js";
import {
  closeAllDbs,
  logger
} from "./chunk-FB4TIUGM.js";

// src/index.ts
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
async function main() {
  const transport = new StdioServerTransport();
  const shutdown = () => {
    logger.info("Shutting down agent-reasoning-mcp server...");
    closeAllDbs();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  process.stdin.on("close", shutdown);
  process.on("uncaughtException", (err) => {
    logger.error(`Uncaught exception: ${err.message}`, err.stack);
  });
  process.on("unhandledRejection", (reason) => {
    logger.error("Unhandled rejection:", reason);
  });
  logger.info("Starting agent-reasoning-mcp stdio transport...");
  await server.connect(transport);
  logger.info("agent-reasoning-mcp server connected and listening on stdio");
}
main().catch((err) => {
  logger.error(`Fatal error in main: ${err.message}`, err.stack);
  process.exit(1);
});
//# sourceMappingURL=index.js.map