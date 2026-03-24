#!/usr/bin/env node

/**
 * postinstall.mjs
 * After npm install, clone the official moltworker source and apply workshop patches.
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const UPSTREAM_DIR = resolve(ROOT, '.upstream');

const GREEN = '\x1b[32m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

function log(msg) { console.log(`  ${GREEN}▸${RESET} ${msg}`); }
function dim(msg) { console.log(`  ${DIM}${msg}${RESET}`); }

// Check if we already have the upstream source
if (existsSync(resolve(ROOT, 'wrangler.toml')) && existsSync(resolve(ROOT, 'src'))) {
  dim('Moltworker source already present — skipping clone.');
  process.exit(0);
}

console.log('');
log('Setting up Moltworker Workshop Edition...');

// Clone upstream if not present
if (!existsSync(UPSTREAM_DIR)) {
  log('Cloning official cloudflare/moltworker...');
  try {
    execSync(
      'git clone --depth 1 https://github.com/cloudflare/moltworker.git .upstream',
      { cwd: ROOT, stdio: 'pipe' }
    );
    log('Clone complete.');
  } catch (e) {
    console.error('  Failed to clone. Please ensure git is installed and you have internet access.');
    console.error('  You can manually clone: git clone https://github.com/cloudflare/moltworker.git .upstream');
    process.exit(0); // Don't fail npm install
  }
} else {
  dim('Upstream source already cloned.');
}

// Copy upstream files into the workshop root (excluding .git, README, package.json, wizard/)
log('Applying workshop overlay...');
try {
  // Copy source files
  const filesToCopy = ['src', 'wrangler.toml', 'tsconfig.json', 'Dockerfile'];
  for (const f of filesToCopy) {
    const src = resolve(UPSTREAM_DIR, f);
    if (existsSync(src)) {
      execSync(`cp -rn "${src}" "${ROOT}/" 2>/dev/null || true`, { stdio: 'pipe' });
    }
  }

  // Install upstream dependencies if they have a package.json
  const upstreamPkg = resolve(UPSTREAM_DIR, 'package.json');
  if (existsSync(upstreamPkg)) {
    const upstream = JSON.parse(readFileSync(upstreamPkg, 'utf-8'));
    const workshopPkg = resolve(ROOT, 'package.json');
    const workshop = JSON.parse(readFileSync(workshopPkg, 'utf-8'));

    // Merge dependencies
    if (upstream.dependencies) {
      workshop.dependencies = { ...upstream.dependencies, ...(workshop.dependencies || {}) };
    }
    if (upstream.devDependencies) {
      workshop.devDependencies = { ...upstream.devDependencies, ...(workshop.devDependencies || {}) };
    }

    writeFileSync(workshopPkg, JSON.stringify(workshop, null, 2) + '\n');
    dim('Merged upstream dependencies into package.json');
  }

  log('Workshop overlay applied.');
} catch (e) {
  dim(`Overlay warning: ${e.message}`);
}

// Apply workshop-specific patches to wrangler.toml
const wranglerPath = resolve(ROOT, 'wrangler.toml');
if (existsSync(wranglerPath)) {
  let toml = readFileSync(wranglerPath, 'utf-8');

  // Add SANDBOX_SLEEP_AFTER default for cost savings
  if (!toml.includes('SANDBOX_SLEEP_AFTER')) {
    toml += `
# Workshop: auto-sleep after 10 minutes idle to save costs
[vars]
SANDBOX_SLEEP_AFTER = "10m"
`;
    writeFileSync(wranglerPath, toml);
    dim('Added SANDBOX_SLEEP_AFTER=10m to wrangler.toml');
  }
}

console.log('');
log('Setup complete! Run: npm run wizard');
console.log('');
