// init sqlite db
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

module.exports = function() {
  const dbFile = './.data/sqlite.db';
  const exists = fs.existsSync(dbFile);
  const db = new sqlite3.Database(dbFile);

  // if ./.data/sqlite.db does not exist, create it
  db.serialize(function(){
    if (!exists) {
      db.run('CREATE TABLE Sites (slug TEXT PRIMARY KEY, url TEXT, profile TEXT, active INTEGER, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)');
      console.log('New table Sites created!');
      db.run('CREATE TABLE SiteChecks (slug TEXT, url TEXT, datetime TEXT DEFAULT CURRENT_TIMESTAMP, result TEXT)');
      console.log('New table SiteChecks created!');
    }
    else {
      console.log('Database "Sites" ready to go!');
    }
  });
  return db;
}