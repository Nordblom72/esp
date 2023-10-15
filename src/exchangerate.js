const EXCHANGERATE_DEFAULTS = {
  url: 'http://api.exchangeratesapi.io/v1/',
  apiKey: 'a8e81400a67c8b049b620d6c22e639fa'
}


function getCurrencyExchangeRate(date, base='EUR', symbol) {
  date = date.split('T')[0];

  const apiUrl =  EXCHANGERATE_DEFAULTS.url + '/' + date +
                  '?access_key=' + EXCHANGERATE_DEFAULTS.apiKey +
                  '&base=' + base + 
                  '&symbols=' + symbol;
  let headers = {
    "Content-Type": "text/json",
  }
  return fetch(apiUrl, {
    method: 'GET',
    headers: headers})
    .then(res => {
      if (res.status === 200) {
        return res.json();
      } else {
        // ToDo: Remove this temporary fix ....
        return({
        "date": `${date}`,
          "rates": {
            "SEK":11.55
          }
        });
      }
    })
    .catch((error) => {
      console.log('Error:', error);
  })
}

module.exports = { getCurrencyExchangeRate };
