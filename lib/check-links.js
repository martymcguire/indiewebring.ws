// we've gotta parse people's webpages
const URL = require('url').URL;
const jsdom = require("jsdom");
const { JSDOM } = jsdom;

module.exports = function (site) {
  return new Promise((fulfill, reject) => {
    const siteBase = 'https://' + process.env.MAIN_URL;
    const expectedPaths = {
      next: '/' + site.slug + '/next',
      previous:  '/' + site.slug + '/previous'
    }
    // FIXME: replace w/ request+cheerio, since microformat-node uses cheerio anyway?
    JSDOM.fromURL(site.url)
      .then(dom => {
        const window = dom.window;
        const doc = window.document;
        let links = doc.querySelectorAll('a');
        let candidatesByPath = Array.prototype.map.call(links, (a) => a.href)
                            .filter(href => (typeof href === 'string') && href.startsWith(siteBase))
                            .map(href => new URL(href))
                            .reduce((by_path, candidate) => {
                              by_path[decodeURIComponent(candidate.pathname)] = candidate; return by_path;
                            }, {})
        let found = {}
        for (let linkType in expectedPaths) {
          if (candidatesByPath[expectedPaths[linkType]]) {
            found[linkType] = decodeURI(candidatesByPath[expectedPaths[linkType]].href);
            delete candidatesByPath[expectedPaths[linkType]];
            delete expectedPaths[linkType];
          }
        }
        let result = {
          found,
          missing: expectedPaths,
          mystery: candidatesByPath,
          active: (Object.keys(found).length > 0)
        };
        // remove any empties
        for (let key of ['found','missing','mystery']) {
          if(Object.keys(result[key]).length === 0) {
            delete result[key];
          }
        }
        fulfill(result);
        window.close();
      })
      .catch(err => {
        fulfill({ status: 0, error: `Problem checking site link: ${err}` });
      })
  });
}