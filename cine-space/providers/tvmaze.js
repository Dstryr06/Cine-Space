// ADAPTER for series (https://api.tvmaze.com). No key. About 20 calls per 10 seconds.
// TODO: call the API with a timeout (AbortController), convert every result with toTitle(),
// and throw httpError(503, ...) when the API is slow or down.
const { httpError } = require("../lib/errors");
const { toTitle } = require("../lib/model");

const notBuilt = () => { throw httpError(501, "tvmaze adapter is not built yet."); };

module.exports = { search: notBuilt, getById: notBuilt, popular: notBuilt };
