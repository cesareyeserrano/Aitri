/**
 * Module: Command — validate
 * Purpose: Verify all pipeline artifacts are present and approved.
 */

import fs from 'fs';
import path from 'path';
import { PHASE_DEFS } from '../phases/index.js';
import { loadConfig, readArtifact } from '../state.js';

export function cmdValidate({ dir }) {
  const config   = loadConfig(dir);
  const approved = new Set(config.approvedPhases || []);
  let allGood    = true;

  console.log(`\n🔍 Validating — ${path.basename(dir)}`);
  console.log('─'.repeat(50));

  const ideaOk = fs.existsSync(path.join(dir, 'IDEA.md'));
  console.log(`${ideaOk ? '✅' : '❌'} IDEA.md`);
  if (!ideaOk) allGood = false;

  for (const p of Object.values(PHASE_DEFS)) {
    const exists     = fs.existsSync(path.join(dir, p.artifact));
    const isApproved = approved.has(p.num);
    let icon, note;
    if (exists && isApproved)   { icon = '✅'; note = ''; }
    else if (exists)            { icon = '⏳'; note = ' (not approved)'; allGood = false; }
    else                        { icon = '❌'; note = ' (MISSING)';      allGood = false; }
    console.log(`${icon} ${p.artifact}${note}`);
  }

  const verifyExists = fs.existsSync(path.join(dir, '04_TEST_RESULTS.json'));
  const verifyPassed = config.verifyPassed;
  if (verifyExists && verifyPassed)       console.log(`✅ 04_TEST_RESULTS.json`);
  else if (verifyExists && !verifyPassed) { console.log(`⏳ 04_TEST_RESULTS.json (verify-complete not run)`); allGood = false; }
  else                                    { console.log(`❌ 04_TEST_RESULTS.json (MISSING)`); allGood = false; }

  console.log('─'.repeat(50));

  if (!allGood) {
    console.log('⚠️  Some artifacts missing or not approved.');
    return;
  }

  console.log('✅ All artifacts present and approved!\n');

  // Show deployment files produced by Phase 5
  const deployFiles = ['Dockerfile', 'docker-compose.yml', 'DEPLOYMENT.md', '.env.example'];
  const found = deployFiles.filter(f => fs.existsSync(path.join(dir, f)));
  const missing = deployFiles.filter(f => !fs.existsSync(path.join(dir, f)));

  console.log('📦 Deployment files:');
  for (const f of found)   console.log(`  ✅ ${f}`);
  for (const f of missing) console.log(`  ⚠️  ${f} — not found (check Phase 5 output)`);

  // Show setup commands from manifest
  const manifestRaw = readArtifact(dir, '04_IMPLEMENTATION_MANIFEST.json');
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

  console.log('\n✅ Pipeline complete. Your project is ready to deploy.');
}
