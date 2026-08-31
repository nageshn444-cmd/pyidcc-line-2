const {onRequest} = require("firebase-functions/v2/https");
const {setGlobalOptions} = require("firebase-functions/v2");

setGlobalOptions({maxInstances: 10, region: "asia-south1"});

exports.apiHealthCheck = onRequest((req, res) => {
  res.status(200).json({
    status: "ok",
    service: "pyidcc-cloud-functions",
    system: "BMRCL Line 2 Peenya Industry Depot Crew Control",
    timestamp: new Date().toISOString(),
  });
});
