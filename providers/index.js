// One place that lists every online API adapter: routes use providers[source].
const jikan = require("./jikan");
const tvmaze = require("./tvmaze");
const movies = require("./movies");

module.exports = { providers: { jikan, tvmaze, movies } };