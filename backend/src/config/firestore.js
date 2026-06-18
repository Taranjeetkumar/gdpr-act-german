const { Firestore } = require('@google-cloud/firestore');

const db = new Firestore({
  projectId: process.env.GCP_PROJECT_ID,
});

db.settings({ ignoreUndefinedProperties: true });

module.exports = db;
