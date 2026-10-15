#!/usr/bin/env node
// Replay reviewer: a clean independent review that scores every mandatory criterion 2.
import fs from 'node:fs';

const prompt = fs.readFileSync(0, 'utf8');
const stage = /^STAGE:\s*(\S+)/m.exec(prompt)?.[1] ?? 'unknown';
const criteria = ['source-fidelity', 'completeness', 'testability', 'consistency'].map(id => ({id, mandatory: true, score: 2, evidence: `Stage ${stage} compared with the PO source and the approved earlier stages.`}));
process.stdout.write(`VERDICT: PASS\n\`\`\`review-data\n${JSON.stringify({criteria, findings: []}, null, 2)}\n\`\`\`\n`);
