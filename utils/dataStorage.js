const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');

function ensureDataDir() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

function readJson(fileName, fallback) {
  ensureDataDir();
  const filePath = path.join(dataDir, fileName);
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(fallback ?? {}, null, 2));
    return fallback ?? {};
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    console.error(`Failed to read ${fileName}`, error);
    return fallback ?? {};
  }
}

function writeJson(fileName, data) {
  ensureDataDir();
  const filePath = path.join(dataDir, fileName);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

module.exports = {
  dataDir,
  readJson,
  writeJson,
  ensureDataDir,
};
