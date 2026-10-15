import path from 'node:path';
import {strip} from './md.mjs';
import {normalizedPath, resolveMixed} from './census-reference-resolution.mjs';

const cell = (hit, name) => hit.row?.[hit.header.findIndex(h => new RegExp(`^(?:${name})$`, 'i').test(strip(h)))];
const unprefix = value => String(value).replace(/^[a-z][a-z-]*:/, '');
export function endpointContext(entry, hit, context) {
  if(hit.declaringBase!==undefined)context={...context,pathBase:hit.declaringBase};
  // PO answer source locators are relative to the project, including when
  // the clarification record is exported under spec/records/.
  if(entry.id==='clarify-record-decision-ref')context={...context,pathBase:''};
  const {doc = {}, docs, primary, screens} = context;
  const required = new Set([entry.source.id, entry.target.id, entry.ownership?.id ?? ''].flatMap(template => [...template.matchAll(/\{([^}]+)\}/g)].map(m => m[1])));
  const whenNeeded = (name, resolve) => required.has(name) ? resolve() : undefined;
  const owner = hit.owner ?? {}, value = hit.value;
  const string = typeof value === 'string' ? value : '';
  const qualified = unprefix(string), ancestors = [...(hit.ancestors ?? []), owner].reverse();
  const nearest = key => ancestors.find(v => v && typeof v === 'object' && Object.hasOwn(v, key))?.[key];
  const rowId = cell(hit, 'ID|AC|Id');
  const screen = nearest('screen') ?? cell(hit, 'Screen') ?? (/^S\d{2}/.test(qualified) ? qualified.split('/')[0] : undefined);
  const state = nearest('state') ?? cell(hit, 'State') ?? qualified.split('/')[1];
  const scenario = qualified.match(/SCN-[A-Z0-9]+-\d+/)?.[0] ?? nearest('id');
  const listed = nearest('us') ?? cell(hit, 'US')?.split(',').map(s => s.trim()) ?? doc.fm?.trace?.us ?? [];
  const scenarioOwners = docs.filter(d => d.fm?.scenarios?.some(s => s.id === scenario) && (!listed.length || listed.includes(d.id))).map(d => d.id);
  const story = doc.type === 'us' ? doc.id : qualified.match(/^((?:US-|NF-)[^.]+)\./)?.[1]
    ?? (/^(US-(?:P?\d+)|NF-\d+)$/.test(qualified) ? qualified : scenarioOwners.length === 1 ? scenarioOwners[0] : listed.length === 1 ? listed[0] : undefined);
  const amendment = qualified.match(/(?:^|\.)(A-\d+)$/)?.[1] ?? hit.heading?.match(/(?:Amendment )?(A-\d+)/)?.[1] ?? nearest('id');
  const dynamic = /\{(?:resolved-|source-kind|affected-kind|qualified-id)/.test(entry.target.id);
  const typedKind = owner.kind ?? owner.canonical_kind;
  let mixed = dynamic ? resolveMixed(value, {...context, body: entry.location.kind.startsWith('body')}, entry.target.kinds) : null;
  if (dynamic && typedKind && entry.target.kinds.includes(typedKind)) mixed = /^[a-z][a-z-]*:/.test(string)
    ? (string.startsWith(`${typedKind}:`) ? string : null) : `${typedKind}:${qualified}`;
  const [mixedKind, ...rest] = (mixed ?? ':').split(':');
  const docKind = ['us', 'contract'].includes(doc.type) ? doc.type : 'artifact';
  const defaultPath = hit.declaringFile === null ? null : hit.declaringFile ?? doc.rel ?? context.file;
  const data = hit.declaringData ?? context.data;
  const recordId = data?.id ?? data?.definition?.id ?? defaultPath;
  const file = string.split('#')[0];
  const relative = entry.location.kind.startsWith('body') || entry.id === 'front-matter-images-src';
  const pathname = () => normalizedPath(file, context, relative ? path.posix.dirname(doc.rel) : context.pathBase ?? context.specBase ?? '');
  const adapter = data?.adapter ?? context.adapter;
  const handle = owner.handle ?? (string.includes('/') ? string.split('/').slice(1).join('/') : string);
  const contract = doc.type === 'contract' ? doc.id : qualified.includes('.') && /A-/.test(qualified) ? qualified.split('.')[0] : primary?.id;
  const rowKey = ancestors.find(v => v?.source && v?.id)?.id;
  const crosswalk = whenNeeded('crosswalk-path', () => data?.crosswalk ? normalizedPath(data.crosswalk, context, path.posix.dirname(defaultPath ?? context.file)) : undefined);
  const sourceSnapshot = whenNeeded('source-snapshot-path', () => string ? normalizedPath(string, context, context.snapshotBase) : undefined);
  const tokens = {
    value: qualified, id: qualified, key: hit.key, 'map-key': hit.key, path: string,
    'value.id': value?.id, 'value.version': value?.version,
    'document-kind': docKind, 'document-id': doc.id,
    'document-path': defaultPath, 'document-or-record-path': defaultPath,
    'record-or-document-path': defaultPath, 'record-id-or-path': recordId, 'catalog-path': defaultPath,
    'record-path': defaultPath, 'row-key': rowKey, 'item-key': rowKey, 'crosswalk-path': crosswalk, 'source-snapshot-path': sourceSnapshot,
    'US-id': story, 'owning-US': story, 'owning-US-or-contract': qualified.includes('.') ? qualified.split('.')[0] : story ?? doc.id,
    'AC-id': qualified.match(/AC-\d+$/)?.[0], 'row-AC-id': rowId,
    'SCN-id': scenario, 'REQ-id': qualified, 'row-REQ-id': rowId,
    'D-id': entry.id === 'contract-amendment-heading-decision' ? hit.match?.[4] : qualified,
    'row-D-id': rowId, 'contract-id': contract, 'A-n': amendment,
    'amendment-row-id': value, 'S-id': screen ?? qualified, screen, state,
    'explicit-state': state, 'declared-state': state, 'W-id': qualified.match(/W-\d{2}/)?.[0],
    'qualified-or-normalized-value': qualified,
    'qualified-value': qualified.includes('.') ? qualified : story ? `${story}.${qualified}` : undefined,
    'qualified-AC': qualified, 'qualified-id': mixed ? rest.join(':') : undefined,
    'qualified-id-or-path': mixed ? rest.join(':') : undefined,
    'exact-node-id': string, 'exact-member-id': qualified,
    'resolved-kind': mixedKind || undefined, 'resolved-id': mixed ? rest.join(':') : undefined,
    'affected-kind': mixedKind || undefined, 'source-kind': mixedKind || undefined, 'resolved-source': mixed ? rest.join(':') : undefined, 'resolved-source-node': mixed,
    'resolved-path': whenNeeded('resolved-path', pathname), 'spec-relative-path': whenNeeded('spec-relative-path', () => normalizedPath(file, context)), 'symbolic-source-id': string,
    'recorded-source': string, 'normalized-document-path': whenNeeded('normalized-document-path', pathname),
    'normalized-image-path': whenNeeded('normalized-image-path', pathname), fragment: string.split('#')[1] ?? '',
    'W-id-from-basename': path.posix.basename(file).match(/W-\d{2}/)?.[0],
    'tests-root': context.testsRoot, file, 'exact-name': string.split('#')[1],
    'declared-group-id': string, 'leading-E-id-or-BRD-id-or-exact-string': string.match(/^(E\d+|BRD-\d+)/)?.[0] ?? string,
    'listed-US-id': story, 'indexed-story-id': hit.row?.join(' ').match(/US-(?:P?\d+)|NF-\d+/)?.[0],
    'id-at-document-path': whenNeeded('id-at-document-path', () => docs.find(d => d.rel === pathname())?.id),
    adapter, handle, 'catalog-kind': data?.kind, locale: data?.locale ?? cell(hit, 'Locale'),
    'tokens.source': whenNeeded('tokens.source', () => data?.tokens?.source ? normalizedPath(data.tokens.source, context) : undefined), stage: data?.stage,
    'epic-id': nearest('id'), 'capability-id': nearest('id'), 'project-root': '',
  };
  if (/^artifact:\{(?:value|qualified-or-normalized-value)\}$/.test(entry.target.id) && /[/.#]/.test(qualified)) tokens.value = tokens['qualified-or-normalized-value'] = normalizedPath(qualified, context);
  if (entry.id === 'epic-map-epics-page') tokens.path = string;
  if (entry.id === 'front-matter-defs-scenario-test') tokens.file = file;
  if (entry.id === 'front-matter-screens') return (screens.get(string) ?? [{screen: string}]).map(row => ({...tokens, 'S-id': row.screen, 'explicit-state': row.state}));
  return [tokens];
}
