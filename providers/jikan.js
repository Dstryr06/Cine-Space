// ADAPTER for anime (https://api.jikan.moe/v4). No key. About 3 requests per second.
// TODO: call the API with a timeout (AbortController), convert every result with toTitle(),
// and throw httpError(503, ...) when the API is slow or down.
const { httpError } = require("../lib/errors");
const { toTitle } = require("../lib/model");

const notBuilt = () => { throw httpError(501, "jikan adapter is not built yet."); };

module.exports = { search: notBuilt, getById: notBuilt, popular: notBuilt };
