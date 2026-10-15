import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {parseJson} from './config/strict-json.mjs';
import {RunnerError} from './config/path-selection.mjs';

// Package version remains the single version source for installs and releases.
export function kitIdentity(root) {
 const version=parseJson(fs.readFileSync(path.join(root,'tools/package.json'),'utf8'),'tools/package.json').version;
 if(typeof version!=='string'||!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version))throw new RunnerError(`Unknown kit version: ${version}`);
 // Do not mistake a repository containing an extracted kit for the kit itself.
 if(fs.existsSync(path.join(root,'.git'))) {
  const git=spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'});
  if(git.status===0)return {version,commit:git.stdout.trim()};
 }
 const file=path.join(root,'kit-release.json');
 if(!fs.existsSync(file))return {version,commit:null};
 const release=parseJson(fs.readFileSync(file,'utf8'),'kit-release.json');
 if(release.version!==version||typeof release.commit!=='string'||!/^[a-f0-9]{40,64}$/.test(release.commit))throw new RunnerError('Invalid kit-release.json: version/commit does not identify this kit');
 return {version,commit:release.commit};
}
