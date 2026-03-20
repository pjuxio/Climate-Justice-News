/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  coverageDirectory: 'coverage',
  collectCoverageFrom: ['server.js', 'public/app.js'],
  coverageThreshold: {
    global: { lines: 60, functions: 65 },
  },
};
