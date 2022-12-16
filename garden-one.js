// we've gotta parse people's webpages
const checkSiteLinks = require('./lib/check-links');

const DB = require('./lib/db');
const db = DB();

const Sites = require('./lib/models/site');
const {addSite, getSite, getSiteBySlug, saveProfile, saveSiteCheckStatus} = Sites(db);

// i want to wait between requests, so let's use a recursive function
// that repeatedly sets a timeout to call itself!
function processSites(sites) {
  const site = Array.prototype.pop.call(sites);
  console.log(site.url, site.slug);
  checkSiteLinks(site)
    .then((status) => {
      saveSiteCheckStatus(site, status);
      console.log(site.url, site.slug, status);
      setTimeout(processSites, 1000, sites);
    });
}

db.all(`SELECT * FROM Sites WHERE url = 'https://wa.rner.me/'`, function(err, rows) {
  processSites(rows);
});
