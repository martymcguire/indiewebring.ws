/**
 * An Express middleware for IndieAuth authentication clients!
 * Requires a req.session.
 * Stores auth state during the round trip to the auth server (req.session.state and req.session.csrfSecret).
 * After handling a successful return from the auth server,
 * data about the logged in user are in req.session.user:
 * { me: http://example.com }
 */

const express = require('express')
const IndieAuthentication = require('indieauth-authentication')
const crypto = require('crypto')
const qs = require('qs')
const qsStringify = qs.stringify

module.exports = function (options) {
  const opts = Object.assign(
    {
      clientId: 'https://' + process.env.PROJECT_DOMAIN + '.glitch.me',
      authStartPath: '/signin',
      indieAuthHandlerPath: '/indieauthhandler',
      successRedirect: '/dashboard'
    },
    options
  )

  const rtr = express.Router()
  
  // Begin the IndieAuth dance. Looks for request.body.me for the user's URL.
  rtr.post(opts.authStartPath, (request, response) => {
    // console.log(request.body)
    request.session.csrfSecret = crypto.randomBytes(32).toString('hex')
    if(request.body.returnTo) {
      request.session.returnTo = request.body.returnTo;
    } else {
      delete request.session.returnTo;
    }
    delete request.session.user
    const indieauthn = new IndieAuthentication({
      clientId: opts.clientId,
      redirectUri: 'https://' + (process.env.MAIN_URL) + opts.indieAuthHandlerPath,
      me: request.body.me,
      state: request.session.csrfSecret,
    })
    indieauthn.getAuthUrl()
      .then((url) => {
        request.session.state = { 
          me: indieauthn.options.me,
          authEndpoint: indieauthn.options.authEndpoint
        }
        response.redirect(url)
      })
      .catch((err) => {
        // couldn't find auth URL. try falling back to indielogin.
        console.log(err)
        let redirect_url = "https://indielogin.com/auth?" + qsStringify({
          me: request.body.me,
          client_id: opts.clientId,
          redirect_uri: 'https://' + (process.env.MAIN_URL) + opts.indieAuthHandlerPath,
          state: request.session.csrfSecret
        })
        request.session.state = { 
          me: indieauthn.options.me,
          authEndpoint: 'https://indielogin.com/auth'
        }
        response.redirect(redirect_url)
      })
  })
  
  // Handle the return from the authorization endpoint.
  // Verify auth code, store user data in req.session.
  rtr.get(opts.indieAuthHandlerPath, (request, response) => {
    if (request.session.csrfSecret != request.query.state) {
      response.status(400).send("The authorization server returned an invalid state parameter")
    }
    const indieauthn = new IndieAuthentication({
      clientId: opts.clientId,
      redirectUri: 'https://' + (process.env.MAIN_URL) + opts.indieAuthHandlerPath,
      state: request.query.state,
      ...request.session.state
    })
    //console.log(['Verifying ', request.query.code, ' with ', indieauthn.options])
    indieauthn.verifyCode(request.query.code)
      .then(me => {
        request.session.user = {
          ...request.session.state,
        }
        delete request.session.state
        delete request.session.csrfSecret
        var redir = opts.successRedirect;
        if( request.session.returnTo ){
          redir = request.session.returnTo;
          delete request.session.returnTo;
        }
        response.redirect(redir)
      })
      .catch(err => {
        console.log(err)
        response.status(400).send(err)
      })
  })
  return rtr
}