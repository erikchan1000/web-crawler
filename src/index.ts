import { RouteCrawler } from "./crawler";
import fs from "fs";
import dotenv from "dotenv";
import JSON from "json5";

dotenv.config();

async function main() {
  const crawler = new RouteCrawler("https://atlas-localhost.stackline.com/", {
    maxDepth: 1,
    maxConcurrency: 5,
    includePatterns: ["^/"],
    excludePatterns: ["\\.(?:jpg|png|gif)$", "/api/", "/password_reset"],
    auth: {
      username: process.env.ATLAS_USERNAME || "",
      password: process.env.ATLAS_PASSWORD || "",
      usernameSelector: "#signin-email",
      passwordSelector: "#signin-password",
      submitSelector: "#signin-button",
      successSelector: ".MuiAvatar-root",
    },
    browserConfig: {
      headless: true,
    },
  });

  console.log("Username: ", process.env.ATLAS_USERNAME);
  console.log("Password: ", process.env.ATLAS_PASSWORD);
  try {
    const [graph, nodes] = await crawler.run();

    // Get route metrics
    const metrics = graph.getRouteMetrics();
    console.log("Route Metrics:", metrics);
    console.log("Test: ", graph, nodes);
    // Save the serializable graph data
    const graphData = await graph.toSerializable()
    const arrayFromMap = Array.from(graphData, ([key, value]) => ({key, value}));
    fs.writeFileSync("route-map.json", JSON.stringify(arrayFromMap, null, 2));
    const nodesData = Array.from(nodes, ([key, value]) => ({key, value}));
    fs.writeFileSync("nodes.json", JSON.stringify(nodesData, null, 2));

    console.log("Route map saved to route-map.json");
    console.log("Screenshots saved in ./screenshots directory");
  } catch (error) {
    console.error("Crawler failed:", error);
  }
}

main().catch(console.error);
