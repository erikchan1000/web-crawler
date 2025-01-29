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
      headless: true,
    },
  });

  console.log("Username: ", process.env.ATLAS_USERNAME);
  console.log("Password: ", process.env.ATLAS_PASSWORD);
  try {
    const [graph, nodes] = await crawler.run();

    // Get route metrics
    const mapToSerializable = Array.from(nodes.values()).map((node) => ({
      path: node.path,
      data: node.data,
    }));

    // Save the serializable graph data
    const graphData = await graph.toSerializable();
    fs.writeFileSync("route-map.json", JSON.stringify(graphData, null, 2));
    fs.writeFileSync("route-nodes.json", JSON.stringify(mapToSerializable, null, 2));

    console.log("Route map saved to route-map.json");
    console.log("Screenshots saved in ./screenshots directory");
  } catch (error) {
    console.error("Crawler failed:", error);
  }
}

main().catch(console.error);
