// One shared way to get a title's full details from its online API. The title page and "add to watchlist"
// both use it, so after you open a title, adding it to the watchlist does not need a second online call.
const { providers } = require("../providers");
const { cached, peek } = require("./cache");

const TTL = 30 * 60 * 1000;     // 30 minutes
const keyFor = (source, id) => `detail:${source}:${id}`;

const getDetails = (source, id) => cached(keyFor(source, id), TTL, () => providers[source].getById(id));
const peekDetails = (source, id) => peek(keyFor(source, id));

module.exports = { getDetails, peekDetails };