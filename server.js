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

// we've gotta parse people's webpages
const checkSiteLinks = require('./lib/check-links');

// and get their h-cards for profile data
const fetchRepresentativeHCard = require('./lib/representative-h-card');

const DB = require('./lib/db');
const db = DB();

const Sites = require('./lib/models/site');
const {addSite, getSite, getSiteBySlug, saveProfile, saveSiteCheckStatus} = Sites(db);

// middleware to always set up a context to pass to templates
app.use(function(req, res, next){
  res.locals.context = {
    'projectUrl': 'https://glitch.com/~' + process.env.PROJECT_NAME
  };
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

function profileFromHCard(site, card) {
  const u = new URL(site.url);
  let profile = {
    cute_url: u.hostname.replace(/^www./,'') + u.pathname.replace(/\/(index.html)?$/,''),
    slug: site.slug,
    slug_encoded: encodeURIComponent(site.slug),
    url: site.url, // don't necessarily trust the URL in the h-card.
  };
  if ( ! ('properties' in card) ) {
    return profile;
  }
  ["name","note","photo"].forEach((prop) => {
    if (prop in card.properties) {
      profile[prop] = card.properties[prop][0];
    }
  });
  return profile;
}

// http://expressjs.com/en/starter/basic-routing.html
app.get("/", function (request, response) {
  response.render('index', response.locals.context)
});

app.get('/dashboard', requireLogin, function(request, response) {
  getSite(request.session.user.me, true) // find site in the db or add it
    .then((site) => {
      return new Promise((fulfill, reject) => {
        db.all(`SELECT * FROM SiteChecks WHERE url="${site.url}" ORDER BY datetime DESC LIMIT 3`, function(err, rows) {
          let parsed_rows = Array.prototype.map.call(rows, row => {
            row.result = JSON.parse(row.result);
            return row;
        });
        if(site.profile) {
          site.profile = profileFromHCard(site, JSON.parse(site.profile));
        }
        site.slug_encoded = encodeURIComponent(site.slug);
        response.locals.context['site'] = site;
        response.locals.context['hostname'] = process.env.MAIN_URL;
        response.locals.context['checks'] = rows;
        fulfill();
        });
      });
    })
    .then(() => {
      response.render('dashboard', response.locals.context);
    });
});

app.get('/directory', function(request, response) {
  return new Promise((fulfill, reject) => {
    db.all('SELECT * FROM Sites WHERE active=1 AND profile IS NOT NULL ORDER BY timestamp DESC', function(err, rows){
      let profiles = Array.prototype.map.call(rows, row => {
        return profileFromHCard(row, JSON.parse(row.profile));
      });
      fulfill(profiles);
    });
  })
  .then((profiles) => {
    response.locals.context['profiles'] = profiles;
    response.render('directory', response.locals.context);
  });
});

app.post('/check-profile', requireLogin, function(request, response) {
  getSite(request.session.user.me)
    .then((site) => {
      fetchRepresentativeHCard(site.url)
      .then((card) => {
        if(card) {
          return saveProfile(site, card);
        }
      })
    })
    .then(() => { setTimeout(() => { response.redirect('/dashboard'); }, 500); });
});

app.post('/remove-profile', requireLogin, function(request, response) {
  getSite(request.session.user.me)
    .then((site) => {
      return saveProfile(site, null);
    })
    .then(() => { response.redirect('/dashboard'); });
});

app.post('/check-links', requireLogin, function(request, response) {
  getSite(request.session.user.me) // find site in db but don't add if missing
    .then((site) => {
      if(site) {
        checkSiteLinks(site)
          .then((status) => saveSiteCheckStatus(site, status))
          .then(() => { response.redirect('/dashboard'); });
      }
    });
});

app.get('/:slug/next', function(request, response) {
  getSiteBySlug(request.params.slug)
    .then((site) => {
      db.get(`SELECT * from Sites where active = 1 AND slug != "${site.slug}" ORDER BY RANDOM() LIMIT 1`, function(err, row) {
        response.redirect(row['url']);
      });
    })
    .catch(() => {
      console.log('Tried to next unknown slug ', request.params.slug);
      response.redirect('/'); 
    });
});

app.get('/:slug/previous', function(request, response) {
  getSiteBySlug(request.params.slug)
    .then((site) => {
      db.get(`SELECT * from Sites where active = 1 AND slug != "${site.slug}" ORDER BY RANDOM() LIMIT 1`, function(err, row) {
        response.redirect(row['url']);
      });
    })
    .catch(() => {
      console.log('Tried to previous unknown slug ', request.params.slug);
      response.redirect('/'); 
    });
});

app.get('/:slug', function(request, response) {
  getSiteBySlug(request.params.slug)
    .then((site) => { 
      if(site.profile) {
          let profile = profileFromHCard(site, JSON.parse(site.profile));
          profile.standalone = true;
          response.locals.context['profile'] = profile;
          response.render('profile', response.locals.context);
      } else {
        response.redirect(site['url']);
      }
    })
    .catch(() => { response.redirect('/'); });
});

// listen for requests :)
var listener = app.listen(process.env.PORT, function () {
  console.log('Your app is listening on port ' + listener.address().port);
});getSiteBySlug