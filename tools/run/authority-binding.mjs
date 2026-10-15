import {canonical} from '../lib/config/strict-json.mjs';

export const sameScope = (left, right) => canonical(left) === canonical(right);

export function decisionAuthority(events, {id, scope, actor, refs = []}) {
  return events.find(event => event.type === 'decision' && (!id || event.id === id)
    && event.actor === actor && sameScope(event.scope, scope)
    && refs.every(ref => event.refs.includes(ref)));
}

export function activeException(exception, scope, actor, at = Date.now()) {
  return exception.status === 'active' && sameScope(exception.scope, scope)
    && exception.by === actor && Date.parse(exception.at) <= at
    && Date.parse(exception.expires) > at;
}
