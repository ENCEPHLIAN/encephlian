const fs = require("fs");

const file = "src/components/AppLayout.tsx";
if (!fs.existsSync(file)) {
  console.error("ERROR: not found:", file);
  process.exit(1);
}

let s = fs.readFileSync(file, "utf8");

// ---- 1) Ensure lucide-react import includes Layers + FileText
// (FileText may already exist; idempotent)
const lucideRe = /import\s*\{([^}]+)\}\s*from\s*["']lucide-react["'];?/m;
const m = s.match(lucideRe);
if (!m) {
  console.error("ERROR: Could not find lucide-react named import in", file);
  process.exit(1);
}
let icons = m[1].split(",").map(x => x.trim()).filter(Boolean);
for (const needed of ["Layers", "FileText"]) {
  if (!icons.includes(needed)) icons.push(needed);
}
icons = Array.from(new Set(icons));
s = s.replace(lucideRe, `import { ${icons.join(", ")} } from "lucide-react";`);

// ---- 2) Find the "Studies" nav item object and infer keys
const studiesIdx = s.search(/["']Studies["']/);
if (studiesIdx === -1) {
  console.error("ERROR: Could not find 'Studies' label in", file);
  process.exit(1);
}

// Expand around Studies to capture its object literal snippet
const windowStart = Math.max(0, studiesIdx - 400);
const windowEnd = Math.min(s.length, studiesIdx + 400);
const around = s.slice(windowStart, windowEnd);

const titleKey =
  (around.match(/\b(title|label|name)\s*:\s*["']Studies["']/) || [])[1] || "title";

const pathKey =
  (around.match(/\b(href|to|path|url)\s*:\s*["'][^"']*\/app\/studies[^"']*["']/) || [])[1]
  || "href";

const iconKey =
  (around.match(/\b(icon|Icon)\s*:\s*[A-Za-z_][A-Za-z0-9_]*/) || [])[1] || "icon";

// ---- 3) Insert Lanes + Reports objects right after Studies object in the nav array
// Find the end of the Studies object: the next "}," after the Studies string
const afterStudies = s.indexOf("Studies", studiesIdx);
let endObj = s.indexOf("},", afterStudies);
if (endObj === -1) endObj = s.indexOf("}", afterStudies);
if (endObj === -1) {
  console.error("ERROR: Could not locate end of Studies nav item object.");
  process.exit(1);
}
endObj = s.indexOf("\n", endObj);
if (endObj === -1) endObj = endObj + 1;

// Avoid duplicate insertion
if (s.includes(`"/app/lanes"`) || s.includes(`'/app/lanes'`)) {
  console.log("Looks like /app/lanes already exists in sidebar. Skipping insert.");
} else {
  const indentMatch = s.slice(0, endObj).match(/(\n[ \t]*)[^\n]*$/);
  const indent = indentMatch ? indentMatch[1] : "\n  ";

  const lanesObj = `${indent}{ ${titleKey}: "Lanes", ${pathKey}: "/app/lanes", ${iconKey}: Layers },`;
  const reportsObj = `${indent}{ ${titleKey}: "Reports", ${pathKey}: "/app/reports", ${iconKey}: FileText },`;

  s = s.slice(0, endObj) + lanesObj + reportsObj + s.slice(endObj);
  console.log("Inserted sidebar items: Lanes, Reports");
}

fs.writeFileSync(file, s);
console.log("Patched:", file);
