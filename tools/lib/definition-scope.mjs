import {digest} from './digests.mjs';
// Definitions pin membership; receipts independently pin selected content.
export function definitionRevision(definition) {
 return digest({definition:{id:definition.id,version:definition.version},kind:definition.scope.kind,ids:[...definition.scope.ids].sort()});
}
export function contentScope(scope,manifest) {
 const members=manifest.members.filter(member=>member.kind===scope.kind&&scope.ids.includes(member.id));
 return {...scope,revision:digest(members)};
}
