// Every error in the API leaves in the same shape: { "errors": ["..."], "fields": { "username": "..." }, "requestId": "..." }
// `fields` is optional: it lets a form put each message next to the input it belongs to.
function httpError(status, message, errors, fields) {
  const error = new Error(message);
  error.status = status;
  error.errors = errors || [message];
  if (fields) error.fields = fields;
  return error;
}

module.exports = { httpError };