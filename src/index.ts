import { RouteCrawler } from "./crawler";
import fs from "fs";
import dotenv from "dotenv";

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
      headless: false,
    },
  });

  console.log("Username: ", process.env.ATLAS_USERNAME);
  console.log("Password: ", process.env.ATLAS_PASSWORD);
  try {
    const graph = await crawler.run();

    // Get route metrics
    const metrics = graph.getRouteMetrics();
    console.log("Route Metrics:", metrics);

    // Save the serializable graph data
    const graphData = graph.toSerializable();
    fs.writeFileSync("route-map.json", JSON.stringify(graphData, null, 2));

    console.log("Route map saved to route-map.json");
    console.log("Screenshots saved in ./screenshots directory");
  } catch (error) {
    console.error("Crawler failed:", error);
  }
}

main().catch(console.error);
