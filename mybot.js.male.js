/**
 * Copyright 2016 IBM Corp. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

var TJBot = require('tjbot'); // all the robot controls
var fs = require('fs'); // file stuff like storing images
const mytemp = require('temp').track(); // create temporary files
var FormData = require('form-data'); // Post pictures to bluemix server
var request = require('request'); // used to get weather company information
var NewsAPI = require('newsapi'); // newsapi.org node.js REST services
var Twitter = require('twitter'); // twitter.com REST services
var WtoN = require('words-to-num'); // convert words to numbers
var ON_DEATH = require('death')({
  uncaughtException: true
}) // catch POSIG SIGNALS to clean up
var config = require('./config'); // our configuration options

// obtain our credentials from config.js
var credentials = config.credentials;

// obtain user-specific config for Twilio
// require the Twilio module and create a REST client
const twilioClient = require('twilio')(credentials.twilio.accountSid, credentials.twilio.authToken);

// obtain user-specific config for Twitter
var SENTIMENT_KEYWORD = config.sentiment_keyword;
var SENTIMENT_ANALYSIS_FREQUENCY_MSEC = config.sentiment_analysis_frequency_sec * 1000;
var MAX_TWEETS = config.sentiment_max_tweets;
var CONFIDENCE_THRESHOLD = config.sentiment_confidence_threshold;

// obtain the API Key for News API (newsapi.org)
var newsAPIKey = credentials.newsapi.apiKey;
var newsapi = new NewsAPI(newsAPIKey);

// obtain user-specific config conversation worspace id to use
var WORKSPACEID = config.conversationWorkspaceId;

// obtain user-specific config at what threshold to report a tone
var toneThreshold = config.toneThreshold;

// obtain user-specific config URL to The Weather Company
var weather_host = credentials.twc.weather_host;
var default_us_zip_code = credentials.twc.default_us_zip_code;
var default_twc_unit = credentials.twc.unit;
var default_twc_language = credentials.twc.language;
var mygolfWeatherURLPrefix = credentials.twc.golfWeatherURLPrefix;
var mygolfWeatherURLSuffix = credentials.twc.golfWeatherURLSuffix;
var myWeatherURLPrefix = credentials.twc.weatherURLPrefix;
var myWeatherURLSuffix = credentials.twc.weatherURLSuffix;

var TWEETS = [];

// create the twitter client
var twitter = new Twitter({
  consumer_key: credentials.twitter.consumer_key,
  consumer_secret: credentials.twitter.consumer_secret,
  access_token_key: credentials.twitter.access_token_key,
  access_token_secret: credentials.twitter.access_token_secret
});

// these are the hardware capabilities that TJ needs for this recipe
var hardware = ['microphone', 'speaker', 'led', 'camera', 'servo'];

// set up TJBot's configuration
var tjConfig = {
  log: {
    level: 'silly' // valid levels are 'error', 'warn', 'info', 'verbose', 'debug', 'silly'
  },
  robot: {
    gender: 'male',
    name: 'Watson'
  },
  listen: {
    inactivityTimeout: -1, // -1 to never timeout or break the connection. Set this to a value in seconds e.g 120 to end connection after 120 seconds of silence
    language: 'en-US'
  },
  speak: {
    language: 'en-US'
  },
  see: {
    confidenceThreshold: {
      object: 0.3,
      text: 0.1,
      faces: 0.1
    },
    camera: {
      height: 720,
      width: 960,
      vflip: false, // flips the image vertically, may need to set to 'true' if the camera is installed upside-down
      hflip: false // flips the image horizontally, should not need to be overridden
    }
  }
};

// instantiate our TJBot!
var tj = new TJBot(hardware, tjConfig, credentials);

// full list of colors that TJ recognizes, e.g. ['red', 'green', 'blue']
var tjColors = tj.shineColors();

// hash map to easily test if TJ understands a color, e.g. {'red': 1, 'green': 1, 'blue': 1}
var colors = {};
tjColors.forEach(function(color) {
  colors[color] = 1;
});

tj.speak("Hello! I'm " + tj.configuration.robot.name + ".  Try saying, " + tj.configuration.robot.name + ", followed by what you want." + "  To get help say, Watson, help me.").then(tj.wave());
tj.shine('green'); // Set LED to green to show listening

// figure out if we want to do Twitter sentiment
var doTwitterSentiment = false;

// figure out if we want to turn on the Tone Analyzer
var doToneAnalyzer = false;

// figure out if we want to tell the current weather
var doWeather = false;
var getZipCode = false;
var zipCode = "";

// figure out if we want to translate something.
var doTranslate = false;
var getLanguage = false;
var langTranslateTo = 'es';
var newLanguage = 'es-ES'; // default translation is to Spanish
var newGender = tj.configuration.robot.gender;

// Does the returned phrase from conversation have an instructions for us to do?
var containsToneAnalyzer = false;
var containsWeather = false;
var containsGolfWeather = false;
var containsNews = false;
var containsTranslate = false;
var containsPicture = false;
var containsSleep = false;
var containsDisco = false;
var containsGoodbye = false;
var containsTwitterSentiment = false;

// listen for utterances
myCallBack = function myListenCallback(msg) {
  tj.shine('green'); // Set LED to green to show listening
  if (getLanguage) {
    getLanguage = false;
    setupLanguageToTranslate(msg.toLowerCase());
    // be sure to send back the language to Watson conversation.
    msg = tj.configuration.robot.name + " " + msg;
  }
  if (doTranslate) {
    doTranslate = false;
    translatePhrase(msg);
  };
  if (doToneAnalyzer) {
    doToneAnalyzer = false;
    analyzePhrase(msg);
  };
  if (doTwitterSentiment) {
    doTwitterSentiment = false;
    SENTIMENT_KEYWORD = msg.toLowerCase();
    searchTwitter(SENTIMENT_KEYWORD);
  };
  if (getZipCode) {
    getZipCode = false;
    // be sure to send back the zip code to Watson conversation.
    zipCode = msg;
    msg = tj.configuration.robot.name + " " + WordsToZip(msg);
  };
  // check to see if they are talking to TJBot
  // listen for utterances with our attention Word
  if (msg.startsWith(tj.configuration.robot.name)) {
    // Turn LED to red to show that the TJBot is speaking
    tj.pulse('red', 0.5);

    // remove our name from the message
    var turn = msg.toLowerCase().replace(tj.configuration.robot.name.toLowerCase(), "");

    // send to the conversation service
    tj.converse(WORKSPACEID, turn, function(response) {
      if (response.description.length > 0) {
        if (response.description.toLowerCase().indexOf("twitter sentiment analysis") >= 0) { // do we want to analyze our tone?
          containsTwitterSentiment = true;
        } else if (response.description.toLowerCase().indexOf("tone analyzer") >= 0) { // do we want to analyze our tone?
          containsToneAnalyzer = true;
        } else if (response.description.toLowerCase().indexOf("the united states zip code") >= 0) {
          getZipCode = true;
        } else if (response.description.toLowerCase().indexOf("the current weather at") >= 0) { // do we want to get the latest weather
          containsWeather = true;
        } else if (response.description.toLowerCase().indexOf("a nice day to play golf") >= 0) { // do we want to get the latest golfing weather
          containsGolfWeather = true;
        } else if (response.description.toLowerCase().indexOf("latest news") >= 0) { // do we want to get the latest news
          containsNews = true;
        } else if (response.description.toLowerCase().indexOf("what language to translate") >= 0) { // are we getting the language to translate to?
          getLanguage = true;
        } else if (response.description.toLowerCase().indexOf("translate to") >= 0) { // do we want to translate
          containsTranslate = true;
        } else if (response.description.toLowerCase().indexOf("a picture") >= 0) { // do we want to take a picture?
          containsPicture = true;
        } else if (response.description.toLowerCase().indexOf("robot is going to sleep") >= 0) { // do we want to sleep?
          containsSleep = true;
        } else if (response.description.toLowerCase().indexOf("disco party") >= 0) { // do we want a disco party?
          containsDisco = true;
        } else if (response.description.toLowerCase().indexOf("goodbye") >= 0) { // do we want a end tjbot?
          containsGoodbye = true;
        }
        // speak the result then do the intended command
        tj.speak(response.description).then(function() {
          if (containsTwitterSentiment) {
            containsTwitterSentiment = false;
            doTwitterSentiment = true;
          } else if (containsToneAnalyzer) {
            containsToneAnalyzer = false;
            doToneAnalyzer = true;
          } else if (containsWeather) {
            containsWeather = false;
            getWeather(zipCode);
          } else if (containsGolfWeather) {
            containsGolfWeather = false;
            getGolfWeather(zipCode);
          } else if (containsNews) {
            containsNews = false;
            getNews();
          } else if (containsTranslate) {
            setupLanguageToTranslate(response.description.toLowerCase());
            containsTranslate = false;
          } else if (containsPicture) {
            containsPicture = false;
            takePic();
          } else if (containsSleep) {
            containsSleep = false;
            sleepSeconds(60);
          } else if (containsDisco) {
            containsDisco = false;
            discoParty();
          } else if (containsGoodbye) {
            tj.wave();
            tj.shine('off');
            process.exit(0);
          }
        });
      }
    });
  }
  tj.shine('green');
};

// Catch control-C key press.
ON_DEATH(function(signal, err) {
  //clean up code here
  if (signal === 'SIGINT')
    console.log("We got the SIGINT! signal=" + signal);
  console.log("Got signal=" + signal + " and err=" + err);
  tj.speak("Okay! I caught the signal. It's been fun!  This is " + tj.configuration.robot.name + "saying, Goodbye!");
});

// start listening for commands or conversation
try {
  tj.listen(myCallBack);
} catch (err) {
  console.log("Caught err=" + err.message);
  tj.listen(myCallBack);
}

// let's have a disco party!
function discoParty() {
  tj.pauseListening();
  tj.play(config.discoPartySoundEffect);
  for (i = 0; i < 30; i++) {
    setTimeout(function() {
      var randIdx = Math.floor(Math.random() * tjColors.length);
      var randColor = tjColors[randIdx];
      tj.shine(randColor);
    }, i * 250);
  }
  tj.shine('green');
  tj.resumeListening();
}

// set location of snore sound effect
var snore = config.snoreSoundEffect;

// let's go to sleep
function sleepSeconds(seconds) {
  tj.stopListening();
  tj.play(snore);
  tj.sleep(seconds * 1000);
  tj.speak("Okay!, I'm up now and ready to go again!");
  tj.listen(myCallBack);
}

// set location of camera-shutter-click-01.mp3 sound effect
var cameraShutterClick = config.cameraShutterClickSoundEffect;

function takePic() {
  // create file path to save to a temp location
  var myfilePath = mytemp.path({
    prefix: 'tjbot',
    suffix: '.jpg'
  });

  tj.play(cameraShutterClick);
  tj.see(myfilePath).then(function(results) {
    var resString = "I believe I see a ";
    var numberofReplies = results.length;
    for (i = 0; i < numberofReplies - 1; i++) {
      //console.log("results[" + i + "].class=" + results[i].class);
      resString = resString + results[i].class + " or a ";
    };
    resString = resString + results[numberofReplies - 1].class;
    //console.log("takePic(): result=" + JSON.stringify(results));
    tj.speak(resString).then(function() {
      // Send picture to server so MMS messages can retrive it
      var form = new FormData();
      var urlToPic = "";

      if (!fs.existsSync(myfilePath)) {
        console.log('++++++ BUMMER PICTURE DOES NOT EXIT myfilePath=' + myfilePath);
      } else {
        form.append('userPhoto', fs.createReadStream(myfilePath));

        form.submit(credentials.twilio.fileUploadURL, function(err, res) {
          // res – response object (http.IncomingMessage)  //
          if (err) {
            console.log('err=' + err);
          }
          res.on('data', function(chunk) {
            urlToPic = chunk.toString();
            //console.log('+++++++ Upload to Bluemix returned urlToPic=' + urlToPic);

            // Send MMS message using twilio
            twilioClient.messages.create({
                to: credentials.twilio.toPhoneNumber,
                from: credentials.twilio.fromPhoneNumber,
                body: resString,
                mediaUrl: urlToPic
              },
              (err, message) => {
                if (err) console.log("err=" + err + " message=" + message);
              });
          });
          res.resume();
        });
      }
    });
  });
}

function setupLanguageToTranslate(turn) {
  // do we want to translate to Arabic
  if (turn.indexOf("arabic") >= 0) {
    tj.isTranslatable('en', 'ar').then(function(result) {
      if (result) {
        tj.speak("Please, tell me the phrase to translate.");
        doTranslate = true;
        langTranslateTo = 'ar';
        newLanguage = 'ar-AE';
        newGender = 'female';
      } else {
        console.log("I cannot translate between English and Arabic.");
      }
    });
  }
  // do we want to translate to Chinese
  if (turn.indexOf("chinese") >= 0) {
    tj.isTranslatable('en', 'zh').then(function(result) {
      if (result) {
        tj.speak("Please, tell me the phrase to translate.");
        doTranslate = true;
        langTranslateTo = 'zh';
        newLanguage = 'zh-CH';
        newGender = 'female';
      } else {
        console.log("I cannot translate between English and Chinese.");
      }
    });
  }
  // do we want to translate to German
  if (turn.indexOf("german") >= 0) {
    tj.isTranslatable('en', 'de').then(function(result) {
      if (result) {
        tj.speak("Please, tell me the phrase to translate.");
        doTranslate = true;
        langTranslateTo = 'de';
        newLanguage = 'de-DE';
        newGender = 'male';
      } else {
        console.log("I cannot translate between English and German.");
      }
    });
  }
  // do we want to translate to French
  if (turn.indexOf("french") >= 0) {
    tj.isTranslatable('en', 'fr').then(function(result) {
      if (result) {
        tj.speak("Please, tell me the phrase to translate.");
        doTranslate = true;
        langTranslateTo = 'fr';
        newLanguage = 'fr-FR';
        newGender = 'female';
      } else {
        console.log("I cannot translate between English and French.");
      }
    });
  }
  // do we want to translate to Italian
  if (turn.indexOf("italian") >= 0) {
    tj.isTranslatable('en', 'it').then(function(result) {
      if (result) {
        tj.speak("Please, tell me the phrase to translate.");
        doTranslate = true;
        langTranslateTo = 'it';
        newLanguage = 'it-IT';
        newGender = 'female';
      } else {
        console.log("I cannot translate between English and Italian.");
      }
    });
  }
  // do we want to translate to Japanese
  if (turn.indexOf("japanese") >= 0) {
    tj.isTranslatable('en', 'ja').then(function(result) {
      if (result) {
        tj.speak("Please, tell me the phrase to translate.");
        doTranslate = true;
        langTranslateTo = 'ja';
        newLanguage = 'ja-JP';
        newGender = 'female';
      } else {
        console.log("I cannot translate between English and Japanese.");
      }
    });
  }
  // do we want to translate to Korean
  if (turn.indexOf("korean") >= 0) {
    tj.isTranslatable('en', 'ko').then(function(result) {
      if (result) {
        tj.speak("Please, tell me the phrase to translate.");
        doTranslate = true;
        langTranslateTo = 'ko';
        newLanguage = 'ko-KO';
        newGender = 'female';
      } else {
        console.log("I cannot translate between English and Korean.");
      }
    });
  }
  // do we want to translate to Spanish
  if (turn.indexOf("spanish") >= 0) {
    tj.isTranslatable('en', 'es').then(function(result) {
      if (result) {
        tj.speak("Please, tell me the phrase to translate.");
        doTranslate = true;
        langTranslateTo = 'es';
        newLanguage = 'es-ES';
        newGender = 'male';
      } else {
        console.log("I cannot translate between English and Spanish.");
      }
    });
  }
  // do we want to translate to Portuguese
  if (turn.indexOf("portuguese") >= 0) {
    tj.isTranslatable('en', 'pt').then(function(result) {
      if (result) {
        tj.speak("Please, tell me the phrase to translate.");
        doTranslate = true;
        langTranslateTo = 'pt';
        newLanguage = 'pt-BR';
        newGender = 'female';
      } else {
        console.log("I cannot translate between English and Portuguese.");
      }
    });
  }
}

// get the news from NEWS API (newsapi.org)
function getNews() {
  // https://newsapi.org/v1/articles?source=cnn&apiKey=
  // To query articles:
  newsapi.articles({
    source: 'cnn', // required
    sortBy: 'top' // optional
  }).then(articlesResponse => {
    /*
      {
        status: "ok",
        source: "cnn", // https://newsapi.org/v1/sources
        sortBy: "top", // top, latest, popular
        articles: [
    	...
        ]
      }
    */
    var resString = "Here is the top news for today from " + articlesResponse.source + ".  ";
    var numTitles = articlesResponse.articles.length;
    if (numTitles > 3) {
      numTitles = 3; // only speak four titles
    }
    for (i = 0; i < numTitles; i++) {
      //console.log(articlesResponse.articles[i].title);
      resString = resString + articlesResponse.articles[i].title + ".  ";
    }
    // console.log("getNews(): inside articleResponse callback resString=" + resString);
    tj.speak(resString);
  });
}

// do the translation and change the gender if needed.
function translatePhrase(msg) {
  tj.translate(msg, 'en', langTranslateTo).then(function(translation) {
    // save the default language and gender used to speak
    var originalLanguage = tj.configuration.speak.language;
    var originalGender = tj.configuration.robot.gender;
    // set the language used to speak
    tj.configuration.speak.language = newLanguage;
    tj.configuration.robot.gender = newGender;
    tj.speak(translation.translations[0].translation);
    // restore the default language and gender used to speak
    tj.configuration.speak.language = originalLanguage;
    tj.configuration.robot.gender = originalGender;
  });
}

// do the analasis of the speakers tone.
function analyzePhrase(msg) {
  tj.analyzeTone(msg).then(function(response) {
    var resString = "Your tone when speaking is as follows, ";
    var tempString = "";

    for (tone_categories = 0; tone_categories < response.document_tone.tone_categories.length; tone_categories++) {
      for (tones = 0; tones < response.document_tone.tone_categories[tone_categories].tones.length; tones++) {
        if (response.document_tone.tone_categories[tone_categories].tones[tones].score >= toneThreshold) {
          tempString = tempString + response.document_tone.tone_categories[tone_categories].tones[tones].tone_name + ", ";
        }
      }
      if (tempString != "") {
        resString = resString + response.document_tone.tone_categories[tone_categories].category_name +
          ", " + tempString;
        tempString = "";
      }
    }
    //console.log ("Tone Analyzer response=" + JSON.stringify(response));
    //console.log("resString=" + resString);
    tj.speak(resString);
  });
}

// call the weather company REST API
function weatherAPI(path, qs, done) {
  var url = weather_host + path; // weather_host comes from the config.js file.
  // console.log(url, qs);
  request({
    url: url,
    method: "GET",
    headers: {
      "Content-Type": "application/json;charset=utf-8",
      "Accept": "application/json"
    },
    qs: qs
  }, function(err, req, data) {
    if (err) {
      done(err);
    } else {
      if (req.statusCode >= 200 && req.statusCode < 400) {
        try {
          done(null, JSON.parse(data));
        } catch (e) {
          console.log(e);
          done(e);
        }
      } else {
        console.log(err);
        done({
          message: req.statusCode,
          data: data
        });
      }
    }
  });
}

function WordsToZip(str) {
  var numStart = 0;
  var numEnd = str.indexOf(" ");
  var zipNumber = "";

  str = str + " ";
  for (i = 0; i < 5; i++) {
    zipNumber = zipNumber + WtoN.convert(str.substring(numStart, numEnd));
    numStart = numEnd;
    str = str.substring(numStart + 1, str.length);
    numStart = 0;
    numEnd = str.indexOf(" ");
    if (numEnd === -1) numEnd = str.length;
  }
  // console.log("zipNumber =" + zipNumber);
  if (zipNumber.length < 5) {
    console.log("Setting Default zip Code Number " + default_us_zip_code);
    zipNumber = default_us_zip_code;
  }
  return (zipNumber);
}

// get the latest Golf weather conditions
function getGolfWeather(zip) {
  var resString = "Sorry, cannot get the golfing conditions right now!";
  var zipNumber = WordsToZip(zip);

  //console.log("getGolfWeather(" + zip + ") zipNumeber=" + zipNumber + "URL=" + mygolfWeatherURLPrefix + zipNumber + mygolfWeatherURLSuffix);

  weatherAPI(mygolfWeatherURLPrefix + zipNumber + mygolfWeatherURLSuffix, {
    units: default_twc_unit,
    language: default_twc_language
  }, function(err, result) {
    if (err) {
      console.log(err);
      resString = "Sorry, cannot get the golfing conditions right now! Error is " + err + ".";
    } else {
      //console.log("result=" + JSON.stringify(result));
      if (result.forecasts[0].golf_category != undefined &&
        result.forecasts[0].golf_category != null &&
        result.forecasts[0].golf_category != "") {
        resString = "The current golfing condition is " + result.forecasts[0].golf_category + ".";
      } else {
        resString = "The current golfing condition is not known at this time. It may not be the best time to play.";
      }
    }
    tj.speak(resString);
  });
}

// get the latest weather conditions
function getWeather(zip) {
  var resString = "";
  var gusting = "";
  var pressure_description = "";
  var wind_speed = "";
  var zipNumber = WordsToZip(zip);

  //console.log("getWeather(" + zip + ") zipNumber=" + zipNumber + "URL=" + myWeatherURLPrefix + zipNumber + myWeatherURLSuffix);

  weatherAPI(myWeatherURLPrefix + zipNumber + myWeatherURLSuffix, {
    units: default_twc_unit,
    language: default_twc_language
  }, function(err, result) {
    if (err) {
      console.log(err);
      resString = "Sorry, cannot get the weather right now! Error is " + err + ".";
    } else {
      // console.log("result=" + JSON.stringify(result));
      if (result.observation.gust != null)
        gusting = "  And gusting to " + result.observation.gust + " miles per hour.";
      if (result.observation.pressure_desc != null) {
        pressure_description = " and the pressure is " + result.observation.pressure_desc + ".";
      } else {
        pressure_description = ".";
      }
      if (result.observation.wspd != null)
        wind_speed = " ,and the wind is blowing at " + result.observation.wspd + " miles per hour.  ";
      resString = "The current temperature is " + result.observation.temp + " degrees fahrenheit" +
        pressure_description + "  It feels like " + result.observation.feels_like +
        wind_speed + gusting;
    }
    tj.speak(resString);
  });
}

function searchTwitter(msg) {
  // search twitter
  var params = {
    q: msg
  };
  twitter.get('search/tweets.json', params, function(error, tweets, response) {
    if (tweets) {
      for (i = 0; i < tweets.statuses.length; i++) {
        var tweet = tweets.statuses[i].text;
        // Remove non-ascii characters (e.g chinese, japanese, arabic, etc.) and
        // remove hyperlinks
        tweet = tweet.replace(/[^\x00-\x7F]/g, "");
        tweet = tweet.replace(/(?:https?|ftp):\/\/[\n\S]+/g, "");

        // keep a buffer of MAX_TWEETS tweets for sentiment analysis
        TWEETS.push(tweet);
      };
      // perform sentiment analysis
      console.log("Performing sentiment analysis of the tweets");
      shineFromTweetSentiment();
    };
  });
}

function shineFromTweetSentiment() {
  // make sure we have at least 5 tweets to analyze, otherwise it
  // is probably not enough.
  if (TWEETS.length > 5) {
    var text = TWEETS.join(' ');
    tj.speak("Analyzing tone of " + TWEETS.length + " tweets").then(function() {
      tj.analyzeTone(text).then(function(tone) {
        tone.document_tone.tone_categories.forEach(function(category) {
          if (category.category_id == "emotion_tone") {
            // find the emotion with the highest confidence
            var max = category.tones.reduce(function(a, b) {
              return (a.score > b.score) ? a : b;
            });

            // make sure we really are confident
            if (max.score >= CONFIDENCE_THRESHOLD) {
              shineForEmotion(max.tone_id);
            }
          }
        });
      });
    });
  } else {
    tj.speak("Sorry!, Not enough tweets collected to perform sentiment analysis");
  }
  TWEETS = [];
}

function shineForEmotion(emotion) {
  tj.speak("Current emotion around " + SENTIMENT_KEYWORD + " is " + emotion).then(function() {
    switch (emotion) {
      case 'anger':
        tj.shine('red');
        break;
      case 'joy':
        tj.shine('yellow');
        break;
      case 'fear':
        tj.shine('magenta');
        break;
      case 'disgust':
        tj.shine('green');
        break;
      case 'sadness':
        tj.shine('blue');
        break;
      default:
        break;
    }
  });
}
