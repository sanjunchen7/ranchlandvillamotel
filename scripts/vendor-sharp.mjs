import { copyFile, mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const destination = path.join(root, "dist", "node_modules");
const packages = [
  "sharp", "detect-libc", "semver",
  "@img/colour", "@img/sharp-linux-x64", "@img/sharp-libvips-linux-x64",
];

async function copyTree(source, target) {
  const info = await stat(source);
  if (info.isDirectory()) {
    await mkdir(target, { recursive: true });
    const entries = await readdir(source);
    for (const entry of entries) await copyTree(path.join(source, entry), path.join(target, entry));
  } else if (info.isFile()) {
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(source, target);
  }
}

for (const packageName of packages) {
  const source = path.join(root, "node_modules", packageName);
  const target = path.join(destination, packageName);
  await rm(target, { recursive: true, force: true });
  await copyTree(source, target);
}
console.log(`Bundled native image runtime for linux-x64 (${packages.join(", ")}).`);
