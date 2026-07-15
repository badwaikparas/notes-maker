import fs from "fs-extra";
import path from "path";

const name = process.argv[2];

if (!name) {
  console.log("Usage: npm run snapshot -- v0.4");
  process.exit(1);
}

const current = "builds/current";
const archive = path.join("builds/archive", name);

await fs.copy(current, archive);

console.log(`Saved snapshot: ${name}`);