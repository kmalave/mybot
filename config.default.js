/*
User-specific configuration
    ** IMPORTANT NOTE ********************
    * Please ensure you do not interchange your username and password.
    * Hint: Your username is the lengthy value ~ 36 digits including a hyphen
    * Hint: Your password is the smaller value ~ 12 characters
*/

exports.conversationWorkspaceId = ''; // replace with the workspace identifier of your conversation

exports.cameraShutterClickSoundEffect = '/home/pi/tjbot/recipes/mybot/camera-shutter-click-01.wav';
exports.snoreSoundEffect = '/home/pi/tjbot/recipes/mybot/snore_1.wav';
exports.discoPartySoundEffect = '/home/pi/git/tjbot/recipes/mybot/KoolTheGang-CelebrationRadio.wav';

exports.toneThreshold = 0.4; // we care about tone analyzer tones when they are greater than 40%

exports.sentiment_keyword = "IBM"; // keyword to monitor in Twitter
exports.sentiment_max_tweets = 100; // maximum number of tweets to analyze
exports.sentiment_confidence_threshold = 0.5; // confidence threshold for sentiment analysis
exports.sentiment_analysis_frequency_sec = 30; // analyze sentiment every N seconds

// Create the credentials object for export
exports.credentials = {};

// Watson Conversation
// https://www.ibm.com/watson/developercloud/conversation.html
exports.credentials.conversation = {
  password: '',
  username: ''
};

// Watson Speech to Text
// https://www.ibm.com/watson/developercloud/speech-to-text.html
exports.credentials.speech_to_text = {
  password: '',
  username: ''
};

// Watson Text to Speech
// https://www.ibm.com/watson/developercloud/text-to-speech.html
exports.credentials.text_to_speech = {
  password: '',
  username: ''
};

// Watson Language Translator
//
exports.credentials.language_translator = {
  password: '',
  username: ''
};

// Watson Tone Analyzer
//
exports.credentials.tone_analyzer = {
  password: '',
  username: ''
};

// News API (newapi.org) API key
//
exports.credentials.newsapi = {
  apiKey: ''
};

// The Weather Company API URL
//
exports.credentials.twc = {
  weather_host: '',
  default_us_zip_code: '73025', // what is the default zip code to use
  units: "e", // Units Empiral (e) or Metirc (m)
  language: "en", // language of response
  golfWeatherURLPrefix: '/api/weather/v1/location/',
  golfWeatherURLSuffix: ':4:US/forecast/hourly/48hour.json',
  weatherURLPrefix: '/api/weather/v1/location/',
  weatherURLSuffix: ':4:US/observations.json'
};

// Twitter
exports.credentials.twitter = {
  consumer_key: '',
  consumer_secret: '',
  access_token_key: '',
  access_token_secret: ''
};

// Twilio
exports.credentials.twilio = {
  // Twilio Credentials
  accountSid: 'AC...',
  authToken: '',
  toPhoneNumber: '+1XXXXXXXXXX',
  fromPhoneNumber: '+1XXXXXXXXXX',
  fileUploadURL: 'https://upload-km.mybluemix.net/api/upload/'
};
