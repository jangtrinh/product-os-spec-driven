import {lintSpec} from '../index.mjs';
import {censusGraph} from '../../../fixtures/runner/census-graph.mjs';

// Positive graph export; omission tests assert their expected edges independently.
export const declaredFixtureGraph=root=>censusGraph(lintSpec(root).model);
