const DB = require('./lib/db');
const db = DB();

const hashEmoji = require('hash-emoji-without-borders');

const addSite = (url, slug) => {
  return new Promise((fulfill, reject) => {
    db.run(`INSERT INTO Sites (slug, url, active) VALUES ("${slug}","${url}", 1);`, function(err) {
      if(err) {
        reject({ message: `Couldn't add site ${url}`, error: err});
      } else {
        fulfill({url: url, slug: slug, active: 1});
      }
    })
  });
};

addSite('http://tantek.com/', '📊');