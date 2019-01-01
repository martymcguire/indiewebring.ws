const DB = require('./lib/db');
const db = DB();

const Site = require('./lib/models/site');
const { saveProfile } = Site(db);

const fetchRepresentativeHCard = require('./lib/representative-h-card');

// i want to wait between requests, so let's use a recursive function
// that repeatedly sets a timeout to call itself!
function processSites(sites) {
  const site = Array.prototype.pop.call(sites);
  console.log(site.url, site.slug);
  fetchRepresentativeHCard(site.url)
    .then((card) => {
      if(card) {
        console.log(card);
        return saveProfile(site, card);
      }
    });
  setTimeout(processSites, 1000, sites);
}

db.all(`SELECT * FROM Sites WHERE profile IS NULL`, function(err, rows) {
  processSites(rows);
});
