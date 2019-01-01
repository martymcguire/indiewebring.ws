const Request = require('request');
const MF2 = require('microformat-node');

function hasPropValue(mfObj, prop, value) {
  return ('properties' in mfObj) && (prop in mfObj['properties']);// && (mfObj['properties'][prop].indexOf(value) !== -1);
}

function hasRelValue(rels, rel, value) {
  return (rel in rels) && (rels[rel].indexOf(value) !== -1);
}

module.exports = function (url) {
  return new Promise((fulfill, reject) => {
    Request(url, (error, res, html) => {
      if (!error && res.statusCode == 200) {
          // a pass at implementing http://microformats.org/wiki/representative-h-card-parsing
          const parsedMf2 = MF2.get({
            'baseUrl': url,
            'html': html,
            'filters': ['h-card']
          });
          const cards = parsedMf2.items;
          // if no cards, no card!
          if(cards.length == 0){
            fulfill(false);
          }
          // if a card has a uid and url of the current url, use it.
          for( let card of cards ){
            if(hasPropValue(card, 'uid', url) && hasPropValue(card, 'url', url)) {
              fulfill(card);
            }
          }
          
          // if a card has a url that is also a rel=me on the page, use it.
          for( let card of cards ){
            if(hasRelValue(parsedMf2.rels, 'me', url)){
              fulfill(card);
            }
          }
          
          // last chance - if there is only 1 card and url matches current url, use it.
          if((cards.length == 1) && hasPropValue(cards[0], 'url', url)) {
            fulfill(cards[0]);
          }
          
          // otherwise, no deal!
          fulfill(false);
      } else {
        reject(error);
      }
    });
  });
}