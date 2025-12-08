#!/usr/bin/env node
// Remove TS build artifacts (.js/.js.map) that have a TS/TSX sibling.
import { readdir, access, unlink } from 'fs/promises';
import path from 'path';

const SRC_DIR = path.resolve(process.cwd(), 'src');

async function hasTsSibling(basePath) {
  const tsPath = `${basePath}.ts`;
  const tsxPath = `${basePath}.tsx`;
  try {
    await access(tsPath);
    return true;
  } catch {
    /* no-op */
  }
  try {
    await access(tsxPath);
    return true;
  } catch {
    /* no-op */
  }
  return false;
}

async function* walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(fullPath);
    } else {
      yield fullPath;
    }
  }
}

async function cleanJsArtifacts() {
  let removed = 0;

  for await (const file of walk(SRC_DIR)) {
    if (!file.endsWith('.js')) continue;

    const base = file.slice(0, -3);
    const hasSibling = await hasTsSibling(base);
    if (!hasSibling) continue; // probably a hand-written JS file, keep it

    try {
      await unlink(file);
      removed++;
    } catch {
      /* ignore failed deletes */
    }

    const mapFile = `${file}.map`;
    try {
      await unlink(mapFile);
      removed++;
    } catch {
      /* map file may not exist */
    }
  }

  if (removed > 0) {
    console.log(`clean: removed ${removed} generated JS artifact(s) from src/`);
  }
}

cleanJsArtifacts().catch((err) => {
  console.error('clean-ts-output failed:', err);
  process.exitCode = 1;
});
