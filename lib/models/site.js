// what if slugs were unicode?
const hashEmoji = require('hash-emoji-without-borders');

module.exports = function(db) {
  const addSite = (url) => {
    return new Promise((fulfill, reject) => {
      let slug = hashEmoji(url, 3);
      db.run(`INSERT INTO Sites (slug, url, active) VALUES ("${slug}","${url}", 1);`, function(err) {
        if(err) {
          reject({ message: `Couldn't add site ${url}`, error: err});
        } else {
          fulfill({url: url, slug: slug, active: 1});
        }
      })
    });
  };
  
  const getSite = (url, create = false) => {
    return new Promise((fulfill, reject) => {
      // FIXME: sanitize url, reject if it isn't one.
      db.get(`SELECT * from Sites where url="${url}"`, function(err, row) {
        if (row == undefined) {
          if (create) {
            addSite(url)
              .then((site) => fulfill(site))
              .catch((err) => reject(err));
          } else {
            reject("Site not found.");
          }
        } else {
          fulfill(row);
        }
      });
    });
  };
  
  const getSiteBySlug = (slug) => {
    return new Promise((fulfill, reject) => {
      // FIXME: sanitize slug
      db.get(`SELECT * from Sites where slug="${slug}"`, function(err, row) {
        if (!err) {
          fulfill(row);
        } else {
          reject(err);
        }
      });
    });
  };
  
  const saveProfile = (site, profile) => {
    return new Promise((fulfill, reject) => {
      let profileStr = (profile === null) ? null : JSON.stringify(profile);
      db.run(`UPDATE Sites SET PROFILE = ? WHERE SLUG = ?;`, profileStr, site.slug);
      fulfill();
    });
  };
  
  const saveSiteCheckStatus = (site, status) => {
    return new Promise((fulfill, reject) => {
      db.run(`INSERT INTO SiteChecks (slug, url, result) VALUES (?, ?, ?)`, site.slug,site.url, JSON.stringify(status));
      db.run(`UPDATE Sites SET ACTIVE = ? WHERE SLUG = ?;`, status.active, site.slug);
      fulfill();
    });
  };
  
  return {
    addSite,
    getSite,
    getSiteBySlug,
    saveProfile,
    saveSiteCheckStatus
  };
}