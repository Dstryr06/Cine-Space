// ADAPTER for movies (TMDB with a free key in .env, or the iTunes Search API with no key). Decide which one first.
// TODO: call the API with a timeout (AbortController), convert every result with toTitle(),
// and throw httpError(503, ...) when the API is slow or down.
const { httpError } = require("../lib/errors");
const { toTitle } = require("../lib/model");

const notBuilt = () => { throw httpError(501, "movies adapter is not built yet."); };

module.exports = { search: notBuilt, getById: notBuilt, popular: notBuilt };
