const { Datastore } = require('@google-cloud/datastore');

const datastore = new Datastore({
  projectId: process.env.GCP_PROJECT_ID,
});

module.exports = datastore;
