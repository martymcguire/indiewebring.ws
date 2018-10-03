// server.js
// where your node app starts

// init project
var express = require('express');
var bodyParser = require('body-parser');
var app = express();
app.use(bodyParser.urlencoded({ extended: true }));

// we've started you off with Express, 
// but feel free to use whatever libs or frameworks you'd like through `package.json`.

// store session data in user's cookies (so: don't store much of it)
const cookieSession = require('cookie-session')
app.use(cookieSession({
  secret: process.env.SECRET, /* for tamper-proofing */
  maxAge: 24 * 60 * 60 * 1000 /* 1 day */
}))

// this lib provides express routes to handle the IndieAuth dance
const IndieAuthAuthn = require('./lib/indieauth-authn')
const indieAuth = IndieAuthAuthn({
  successRedirect: '/dashboard',
  clientId: 'https://' + process.env.MAIN_URL + '/' });
app.use(indieAuth)

// render html with http://handlebarsjs.com/
var exphbs = require('express-handlebars');
var hbs = exphbs.create({
  defaultLayout: 'main',
  extname: '.hbs',
});
app.engine('hbs', hbs.engine);
app.set('views', __dirname + '/views');
app.set('view engine', 'hbs');

// what if slugs were unicode?
const hashEmoji = require('hash-emoji-without-borders');

// we've gotta parse people's webpages
const jsdom = require("jsdom");
const { JSDOM } = jsdom;

// middleware to always set up a context to pass to templates
app.use(function(req, res, next){
  res.locals.context = {};
  if(req.session.user) {
    res.locals.context['user'] = req.session.user
  }
  next();
});

// a middleware to kick people to the homepage if they are not logged in
function requireLogin(request, response, next) {
  if(! request.session.user) { return response.redirect('/') }
  next();
}

// http://expressjs.com/en/starter/static-files.html
app.use(express.static('public'));

// init sqlite db
var fs = require('fs');
var dbFile = './.data/sqlite.db';
var exists = fs.existsSync(dbFile);
var sqlite3 = require('sqlite3').verbose();
var db = new sqlite3.Database(dbFile);

// if ./.data/sqlite.db does not exist, create it
db.serialize(function(){
  if (!exists) {
    db.run('CREATE TABLE Sites (slug TEXT PRIMARY KEY, url TEXT, active INTEGER, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)');
    console.log('New table Sites created!');
    db.run('CREATE TABLE SiteChecks (slug TEXT, url TEXT, datetime TEXT DEFAULT CURRENT_TIMESTAMP, result TEXT)');
    console.log('New table SiteChecks created!');
  }
  else {
    console.log('Database "Sites" ready to go!');
  }
});

function addSite(url) {
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
}

function getSite(url, create = false) {
  return new Promise((fulfill, reject) => {
    db.get(`SELECT * from Sites where url="${url}"`, function(err, row) {
      if ((row == undefined) && create) {
        addSite(url)
          .then((site) => fulfill(site))
          .catch((err) => reject(err))
      } else {
        fulfill(row);
      }
    });
  });
}

function checkSiteLinks(site) {
  return new Promise((fulfill, reject) => {
    const siteBase = 'https://' + process.env.MAIN_URL;
    const expectedPaths = {
      next: '/' + site.slug + '/next',
      previous:  '/' + site.slug + '/previous'
    }
    JSDOM.fromURL(site.url)
      .then(dom => {
        const window = dom.window;
        const doc = window.document;
        let links = doc.querySelectorAll('a');
        let candidatesByPath = Array.prototype.map.call(links, (a) => a.href)
                            .filter(href => href.startsWith(siteBase))
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

function saveSiteCheckStatus(site, status) {
  db.run(`INSERT INTO SiteChecks (slug, url, result) VALUES (?, ?, ?)`, site.slug,site.url, JSON.stringify(status));
  db.run(`UPDATE Sites SET ACTIVE = ? WHERE SLUG = ?;`, status.active, site.slug);
}

// http://expressjs.com/en/starter/basic-routing.html
app.get("/", function (request, response) {
  response.render('index', response.locals.context)
});

app.get('/dashboard', requireLogin, function(request, response) {
  getSite(request.session.user.me, true) // find site in the db or add it
    .then((site) => {
    db.all(`SELECT * FROM SiteChecks WHERE url="${site.url}" ORDER BY datetime DESC LIMIT 3`, function(err, rows) {
      let parsed_rows = Array.prototype.map.call(rows, row => {
        row.result = JSON.parse(row.result);
        return row;
      });
      response.locals.context['site'] = site;
      response.locals.context['hostname'] = process.env.MAIN_URL;
      response.locals.context['checks'] = rows;
      response.render('dashboard', response.locals.context);
    });
  });
});

app.post('/check-links', requireLogin, function(request, response) {
  getSite(request.session.user.me) // find site in db but don't add if missing
    .then((site) => {
      if(site) {
        checkSiteLinks(site)
          .then((status) => {
            saveSiteCheckStatus(site, status);
            response.redirect('/dashboard');
          });
      }
    });
});

app.get('/:slug/next', function(request, response) {
  db.get(`SELECT * from Sites where slug="${request.params.slug}"`, function(err, row) {
    db.get(`SELECT * from Sites where active = 1 AND slug != "${request.params.slug}" ORDER BY RANDOM() LIMIT 1`, function(err, row) {
      response.redirect(row['url']);
    });
  });
});

app.get('/:slug/previous', function(request, response) {
  db.get(`SELECT * from Sites where slug="${request.params.slug}"`, function(err, row) {
    db.get(`SELECT * from Sites where active = 1 AND slug != "${request.params.slug}" ORDER BY RANDOM() LIMIT 1`, function(err, row) {
      response.redirect(row['url']);
    });
  });
});

app.get('/:slug', function(request, response) {
  db.get(`SELECT * from Sites where slug="${request.params.slug}"`, function(err, row) {
    if(row) {
      response.redirect(row['url']);
    } else {
      response.redirect('/');
    }
  });
});

// listen for requests :)
var listener = app.listen(process.env.PORT, function () {
  console.log('Your app is listening on port ' + listener.address().port);
});
