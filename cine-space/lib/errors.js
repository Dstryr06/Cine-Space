function httpError(status, message, errors) {
  const error = new Error(message);
  error.status = status;
  error.errors = errors || [message];
  return error;
}

module.exports = { httpError };
