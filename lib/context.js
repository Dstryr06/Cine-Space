// Per-request context (request id + the outgoing API calls it triggered), carried through async code
// without passing it around. This is what lets an upstream call be traced back to the request that caused it.
const { AsyncLocalStorage } = require("async_hooks");
const als = new AsyncLocalStorage();
module.exports = { run: (ctx, fn) => als.run(ctx, fn), get: () => als.getStore() || null };
