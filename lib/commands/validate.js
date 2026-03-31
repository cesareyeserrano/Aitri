/**
 * Module: Command — validate
 * Purpose: Verify all pipeline artifacts are present and approved.
 */

import fs from 'fs';
import path from 'path';
import { PHASE_DEFS, OPTIONAL_PHASES } from '../phases/index.js';
import { loadConfig, readArtifact, artifactPath, hasDrift } from '../state.js';
import { openBugCount } from './bug.js';

export function cmdValidate({ dir, args = [] }) {
  if (args.includes('--json')) return cmdValidateJson({ dir });

  const config   = loadConfig(dir);
  const approved = new Set(config.approvedPhases || []);
  let allGood    = true;

  console.log(`\n🔍 Validating — ${path.basename(dir)}`);
  console.log('─'.repeat(50));

  const ideaOk = fs.existsSync(path.join(dir, 'IDEA.md'));
  console.log(`${ideaOk ? '✅' : '❌'} IDEA.md`);
  if (!ideaOk) allGood = false;

  // Optional phases — informational only, never block pipeline
  for (const key of OPTIONAL_PHASES) {
    const p      = PHASE_DEFS[key];
    const exists = fs.existsSync(artifactPath(dir, config, p.artifact));
    if (!exists) continue;
    const isApproved = approved.has(p.num);
    const icon = isApproved ? '✅' : '⏳';
    const note = isApproved ? '' : ' (not approved — optional)';
    console.log(`${icon} ${p.artifact}${note}`);
  }

  // Core phases — required for pipeline completion
  const CORE_PHASE_NUMS = [1, 2, 3, 4, 5];
  for (const num of CORE_PHASE_NUMS) {
    const p          = PHASE_DEFS[num];
    const exists     = fs.existsSync(artifactPath(dir, config, p.artifact));
    const isApproved = approved.has(p.num);
    let icon, note;
    if (exists && isApproved)   { icon = '✅'; note = ''; }
    else if (exists)            { icon = '⏳'; note = ' (not approved)'; allGood = false; }
    else                        { icon = '❌'; note = ' (MISSING)';      allGood = false; }
    if (exists && isApproved && hasDrift(dir, config, num, p.artifact)) {
      note += `  ⚠️  DRIFT: artifact modified after approval — human must review and re-approve (run: aitri approve ${p.alias || num} in your terminal)`;
      allGood = false;
    }
    console.log(`${icon} ${p.artifact}${note}`);
  }

  const verifyExists = fs.existsSync(artifactPath(dir, config, '04_TEST_RESULTS.json'));
  const verifyPassed = config.verifyPassed;
  if (verifyExists && verifyPassed)       console.log(`✅ 04_TEST_RESULTS.json`);
  else if (verifyExists && !verifyPassed) { console.log(`⏳ 04_TEST_RESULTS.json (verify-complete not run)`); allGood = false; }
  else                                    { console.log(`❌ 04_TEST_RESULTS.json (MISSING)`); allGood = false; }

  // Bug warnings — open/fixed bugs present (non-blocking info)
  const activeBugs = openBugCount(dir, config);
  if (activeBugs !== null && activeBugs > 0) {
    console.log(`  ⚠️  ${activeBugs} open bug(s) — critical/high severity will block verify-complete. Run: aitri bug list`);
  }

  console.log('─'.repeat(50));

  if (!allGood) {
    console.log('⚠️  Some artifacts missing or not approved.');
    return;
  }

  console.log('✅ All artifacts present and approved!\n');

  // Show deployment files produced by Phase 5
  const deployRequired = ['Dockerfile', 'docker-compose.yml'];
  const deployOptional = ['DEPLOYMENT.md', '.env.example'];
  const allDeploy      = [...deployRequired, ...deployOptional];
  const found          = allDeploy.filter(f => fs.existsSync(path.join(dir, f)));
  const missingReq     = deployRequired.filter(f => !fs.existsSync(path.join(dir, f)));
  const absentOpt      = deployOptional.filter(f => !fs.existsSync(path.join(dir, f)));

  console.log('📦 Deployment files:');
  for (const f of found)       console.log(`  ✅ ${f}`);
  for (const f of missingReq)  console.log(`  ⚠️  ${f} — not found (check Phase 5 output)`);
  for (const f of absentOpt)   console.log(`  ℹ️  ${f} — optional, not present`);

  // Show setup commands from manifest
  const manifestRaw = readArtifact(dir, '04_IMPLEMENTATION_MANIFEST.json', config.artifactsDir);
  if (manifestRaw) {
    try {
      const manifest = JSON.parse(manifestRaw);
      const cmds = manifest.setup_commands || [];
      if (cmds.length) {
        console.log('\n🚀 Setup commands (from 04_IMPLEMENTATION_MANIFEST.json):');
        for (const cmd of cmds) console.log(`  ${cmd}`);
      }
    } catch { /* malformed manifest — skip */ }
  }

  // Point to DEPLOYMENT.md if it exists
  if (fs.existsSync(path.join(dir, 'DEPLOYMENT.md'))) {
    console.log(`\n📖 Full deploy instructions: ${path.join(dir, 'DEPLOYMENT.md')}`);
  }

  console.log('\n✅ Pipeline complete. Deployment artifacts are ready — run your deploy commands to ship.');
}

// ── JSON output ───────────────────────────────────────────────────────────────

function cmdValidateJson({ dir }) {
  const config   = loadConfig(dir);
  const approved = new Set(config.approvedPhases || []);

  const artifacts = [];
  const CORE_PHASE_NUMS = [1, 2, 3, 4, 5];

  const ideaExists = fs.existsSync(path.join(dir, 'IDEA.md'));
  artifacts.push({ name: 'IDEA.md', exists: ideaExists, approved: ideaExists, drift: false, required: true });

  for (const key of OPTIONAL_PHASES) {
    const p      = PHASE_DEFS[key];
    const exists = fs.existsSync(artifactPath(dir, config, p.artifact));
    if (!exists) continue;
    const isApproved = approved.has(p.num);
    const drift = isApproved && hasDrift(dir, config, p.num, p.artifact);
    artifacts.push({ name: p.artifact, exists, approved: isApproved, drift, required: false, optional: true });
  }

  for (const num of CORE_PHASE_NUMS) {
    const p          = PHASE_DEFS[num];
    const exists     = fs.existsSync(artifactPath(dir, config, p.artifact));
    const isApproved = approved.has(p.num);
    const drift      = isApproved && hasDrift(dir, config, p.num, p.artifact);
    artifacts.push({ name: p.artifact, exists, approved: isApproved, drift, required: true });
  }

  const verifyExists = fs.existsSync(artifactPath(dir, config, '04_TEST_RESULTS.json'));
  artifacts.push({
    name: '04_TEST_RESULTS.json', exists: verifyExists,
    approved: !!(verifyExists && config.verifyPassed), drift: false, required: true,
    verifyPassed: !!config.verifyPassed,
  });

  const allGood = artifacts
    .filter(a => a.required)
    .every(a => a.exists && a.approved && !a.drift);

  const deployFiles = ['Dockerfile', 'docker-compose.yml', 'DEPLOYMENT.md', '.env.example'];
  const deployStatus = Object.fromEntries(
    deployFiles.map(f => [f, fs.existsSync(path.join(dir, f))])
  );

  let setupCommands = [];
  try {
    const m = JSON.parse(readArtifact(dir, '04_IMPLEMENTATION_MANIFEST.json', config.artifactsDir) || '{}');
    setupCommands = m.setup_commands || [];
  } catch { /* non-fatal */ }

  process.stdout.write(JSON.stringify({
    project:  config.projectName || path.basename(dir),
    dir,
    allValid: allGood,
    artifacts,
    deployFiles: deployStatus,
    setupCommands,
  }, null, 2) + '\n');
}
