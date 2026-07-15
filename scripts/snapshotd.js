import fs from "fs-extra";
import path from "path";

const current = "builds/current";
const archiveRoot = "builds/archive";

if (!(await fs.pathExists(current))) {
    console.log("No current build found. Run npm run build first.");
    process.exit(1);
}

await fs.ensureDir(archiveRoot);

const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-");

const destination = path.join(archiveRoot, timestamp);

await fs.copy(current, destination);

console.log(`Snapshot saved to ${destination}`);