const {onCall} = require("firebase-functions/v2/https");
const {setGlobalOptions} = require("firebase-functions/v2");

setGlobalOptions({maxInstances: 10, region: "asia-south1"});
