const { findUser } = require('./userStorage');

async function getViewer(req) {
  const username = req.session?.user?.username;
  if (!username) return null;
  return findUser(username);
}

function getSessionUser(req) {
  return req.session?.user || null;
}

module.exports = {
  getSessionUser,
  getViewer,
};
