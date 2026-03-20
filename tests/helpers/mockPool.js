'use strict';

/**
 * Creates a reusable pg Pool mock.
 * The default query mock resolves with an empty curation row.
 * Override individual calls with mockResolvedValueOnce() as needed.
 */
function makeMockPool(overrides = {}) {
  return {
    query: jest.fn().mockResolvedValue({
      rows: [{ hidden: [], pinned: [], manual: [] }],
    }),
    ...overrides,
  };
}

module.exports = { makeMockPool };
