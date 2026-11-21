// Creates an Error whose status and message are safe to send to the client.
const httpError = (statusCode, message) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.expose = true;
  return err;
};

// Escapes user input for use inside a RegExp, so searches like "C++" or "(draft"
// match literally instead of throwing or enabling ReDoS.
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

module.exports = { httpError, escapeRegex };
