/**
 * Copyright 2020, Chaitanya Prakash N <chaitanyaprakash.n@gmail.com>
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'user strict';
const cheerio = require('cheerio');
const {BigQuery} = require('@google-cloud/bigquery');
const express = require('express');
const https = require('https');
const jsonSchema = require('./jsonSchema.json');
const swaggerUI = require('swagger-ui-express');
const validate = require('jsonschema').validate;
const YAML = require('yamljs');
const swaggerDoc = YAML.load('./swagger.yaml');

/**
 * Constants related to BQ Schema and Queries
 */
const COUNTRY_NAME = 'country_name';
const CASES = 'cases';
const STATES = 'states';
const NAME = 'name';
const STATE_NAME = 'state_name';
const NUM_ACTIVE = 'active';
const NUM_CURED = 'cured';
const NUM_DEATHS = 'deaths';
const NUM_MIGRATED = 'migrated';
const TOTAL = 'total';
const UPDATED_AT = 'updated_at';
const REQ_UPDATED_AT = 'updatedAt';
const INGESTED_AT = 'ingested_at';

const BQ_LOCATION = process.env.BQ_LOCATION;
const GCP_PROJECT_ID = process.env.GCP_PROJECT_ID;
const BQ_DATASET_ID = process.env.BQ_DATASET_ID;
const BQ_TABLE_NAME = process.env.BQ_TABLE_NAME;
const BQ_TABLE = `${GCP_PROJECT_ID}.${BQ_DATASET_ID}.${BQ_TABLE_NAME}`;

const bigquery = new BigQuery({projectId: GCP_PROJECT_ID});

/**
 * Send response
 * @param {object} res server response
 * @param {code} code error code
 * @param {object} data data to be sent in the response
 */
function sendResponse(res, code, data) {
  console.log(`Sending response: ${code}`);
  res.writeHead(code, {'content-type': 'application/json'});
  res.end(JSON.stringify(data));
}

/**
 * Flatten the data into BQ schema format
 * @param {object} data COVID-19 case data to be ingested
 * @return {object} rows flattened data for easy ingestion into BQ
 */
function flattenData(data) {
  console.log(`Flattening data...`);
  const ingestedAt = new Date();

  const rows = [];
  const row = {};
  row[COUNTRY_NAME] = data[NAME];
  row[STATE_NAME] = null;
  row[NUM_ACTIVE] = data[CASES][NUM_ACTIVE];
  row[NUM_CURED] = data[CASES][NUM_CURED];
  row[NUM_DEATHS] = data[CASES][NUM_DEATHS];
  row[NUM_MIGRATED] = data[CASES][NUM_MIGRATED];
  row[TOTAL] = data[CASES][TOTAL];
  row[UPDATED_AT] = data[REQ_UPDATED_AT];
  row[INGESTED_AT] = ingestedAt;
  rows.push(row);

  data[STATES].forEach((state) => {
    const row = {};
    row[COUNTRY_NAME] = data[NAME];
    row[STATE_NAME] = state[NAME];
    row[NUM_ACTIVE] = state[CASES][NUM_ACTIVE];
    row[NUM_CURED] = state[CASES][NUM_CURED];
    row[NUM_DEATHS] = state[CASES][NUM_DEATHS];
    row[NUM_MIGRATED] = state[CASES][NUM_MIGRATED];
    row[TOTAL] = state[CASES][TOTAL];
    row[UPDATED_AT] = data[REQ_UPDATED_AT];
    row[INGESTED_AT] = ingestedAt;
    rows.push(row);
  });

  return rows;
}

/**
 * Write to BQ and send response
 * @param {object} data flattened COVID-19 case data to be ingested
 * @param {string} isoStr updatedAt time as ISO8601 string
 * @param {Function} callback function to be invoked after writing
 * @param {object} res server response
 */
async function writeToBigQuery(data, isoStr, callback, res) {
  console.log(`Writing to BigQuery: ${JSON.stringify(data)}`);

  // Check if the entries already exist
  console.log(`Checking if entry already exists for ${isoStr}`);

  // Finding closest date time (within 1 second difference)
  const TIMESTAMP_EXISTS =
  `
  SELECT
    TIMESTAMP_DIFF(TIMESTAMP '${isoStr}', updated_at, SECOND) as diff
  FROM
    \`${BQ_TABLE}\`
  WHERE
    updated_at <= '${isoStr}'
  ORDER BY diff ASC
  LIMIT 1;
  `;

  const options = {query: TIMESTAMP_EXISTS, location: BQ_LOCATION};
  const [job] = await bigquery.createQueryJob(options);
  console.log(`Query job ${job.id} started`);

  job
      .getQueryResults()
      .then(([rows]) => {
        if (rows == null || rows.length == 0 || rows[0]['diff'] > 0) {
          console.error('No data found: Write to BQ');

          bigquery
              .dataset(BQ_DATASET_ID)
              .table(BQ_TABLE_NAME)
              .insert(data)
              .then((data) => {
                callback(res, 200,
                    {error: `Ingestion successful for ${isoStr}`});
              })
              .catch((err) => {
                console.error(`Error while writing to BigQuery: ${err}`);
                callback(res, 500, {error: err});
              });
        } else if (rows != null && rows.length > 0 && rows[0]['diff'] == 0) {
          console.log(`Entries already exist for ${isoStr}`);
          callback(res, 200, {
            error: 'Data already exists. Write request is ignored',
          });
        }
      })
      .catch((err) => {
        console.error(`Error while querying from BigQuery: ${err}`);
        callback(res, 500, {error: err});
      });
}

/**
 * Unflatten the data into API response format
 * @param {object} data COVID-19 case data to be returned
 * @return {object} unflattenedData unflattened data (api response format)
 */
function unFlattenData(data) {
  console.log(`Unflattening data...`);

  const unflattenedData = {};
  const states = [];

  data.forEach((row) => {
    const isState = (row[STATE_NAME] != null);
    const record = {};

    const cases = {};
    cases[NUM_ACTIVE] = row[NUM_ACTIVE];
    cases[NUM_CURED] = row[NUM_CURED];
    cases[NUM_DEATHS] = row[NUM_DEATHS];
    cases[NUM_MIGRATED] = row[NUM_MIGRATED];
    cases[TOTAL] = row[TOTAL];

    if (isState) {
      record[CASES] = cases;
      record[NAME] = row[STATE_NAME];
      states.push(record);
    } else {
      unflattenedData[CASES] = cases;
      unflattenedData[NAME] = row[COUNTRY_NAME];
      unflattenedData[REQ_UPDATED_AT] = row[UPDATED_AT]['value'];
    }
  });

  unflattenedData[STATES] = states;

  return unflattenedData;
}


/**
 * Read data from BQ for a specified date/time
 * @param {string} isoStr date/time as ISO8601 string
 * @param {Function} callback function to be called with response data
 * @param {object} res server response
 */
async function readFromBigQuery(isoStr, callback, res) {
  const READ_QUERY =
`
  SELECT 
    ${COUNTRY_NAME},
    ${STATE_NAME},
    ${NUM_ACTIVE},
    ${NUM_CURED},
    ${NUM_DEATHS},
    ${NUM_MIGRATED},
    ${TOTAL},
    ${UPDATED_AT}
  FROM
    \`${BQ_TABLE}\`,
    (
      SELECT 
        updated_at as closest_updated_at
      FROM 
      \`${BQ_TABLE}\`
      WHERE
        updated_at <= '${isoStr}'
      ORDER BY 
       TIMESTAMP_DIFF(TIMESTAMP '${isoStr}', updated_at, SECOND) ASC
      LIMIT 1
    )
  WHERE
    updated_at = closest_updated_at;
`;

  const options = {query: READ_QUERY, location: BQ_LOCATION};
  const [job] = await bigquery.createQueryJob(options);
  console.log(`Query job ${job.id} started`);

  job
      .getQueryResults()
      .then(([rows]) => {
        if (rows == null || rows.length == 0) {
          console.error('No data found!');
          callback(res, 404,
              {error: `No data found for ${isoStr}`});
        } else {
          console.log(`Total rows received: ${rows.length}`);
          callback(res, 200, unFlattenData(rows));
        }
      })
      .catch((err) => {
        console.error(`Error while querying from BigQuery: ${err}`);
        callback(res, 500, {error: err});
      });
}

/**
 * Write COVID-19 data of a particular date/time into BigQuery
 * If data already exists, then data will not be ingested.
 * @param {object} data COVID-19 case data to be ingested
 * @param {object} res server response object
 */
function writeData(data, res) {
  console.log(`Writing to BigQuery`);

  // Validate that the request body is correct
  const results = validate(data, jsonSchema);
  if (results.errors && results.errors.length > 0) {
    console.error(`Errors in config: ${results.errors}`);
    sendResponse(res, 400, {error: results.errors});
  } else {
    // Write to BQ
    const flattenedData = flattenData(data);
    const isoStr = new Date(Date.parse(data[REQ_UPDATED_AT])).toISOString();
    writeToBigQuery(flattenedData, isoStr, sendResponse, res);
  }
}

/**
 * Fetch COVID-19 data as of a particular date/time into BigQuery
 * If no data already exists, then 404 error is returned.
 * @param {object} requestedDate data as of a specified date
 * @param {object} res server response object
 */
function readData(requestedDate, res) {
  console.log(`Reading data from BigQuery`);

  let date = new Date();
  if (requestedDate != null && requestedDate.trim() != '') {
    date = new Date(Date.parse(requestedDate));
  }

  try {
    const isoStr = date.toISOString();
    readFromBigQuery(isoStr, sendResponse, res);
  } catch (err) {
    sendResponse(res, 400, {error: `Invalid input: ${requestedDate}`});
  }
}

/**
 * Download COVID-19 India Cases Data from the
 * Ministry of Health and Family Welfare (mohfw.gov.in)
 * @param {Function} callback function to invoke after fetching the data
 * @param {object} res server response object
 */
function currentCovid19Data(callback, res) {
  const DOWNLOAD_URL = 'www.mohfw.gov.in';
  const httpsOptions = {
    hostname: DOWNLOAD_URL,
    port: 443,
    path: '/',
    method: 'GET',
  };

  https
      .request(httpsOptions, (resp) => {
        let data = '';
        console.log(`Response Status Code: ${resp.statusCode}`);
        resp.on('data', (chunk) => data += chunk);
        resp.on('end', () => parseResponse(callback, data, res));
      })
      .on('error', (error) => {
        console.error(`Error occurred while fetching data: ${error}`);
        sendResponse(response, 500, {error: error});
      })
      .end();
}

/**
 * Parse COVID-19 India Cases Data from the
 * Ministry of Health and Family Welfare (mohfw.gov.in) website
 * and send the response back to the client
 * @param {callback} callback callback function
 * @param {string} data html page data (mohfw.gov.in)
 * @param {object} res server response object
 */
function parseResponse(callback, data, res) {
  console.log('Parsing data...');
  const $ = cheerio.load(data);

  const updatedAtStr = $('div .status-update > h2 > span').text();
  const dateAndTimeStr =
    updatedAtStr
        .substring(updatedAtStr.indexOf(': ')+1)
        .replace(/, /, ' ')
        .replace(/ IST /, '')
        .replace('(', ' ')
        .replace(')', '')
        .trim();
  const updatedAt = new Date(Date.parse(dateAndTimeStr));
  const numActive = parseInt(
      $('div .site-stats-count ul').find('.bg-blue strong').text().trim());
  const numCured = parseInt(
      $('div .site-stats-count ul').find('.bg-green strong').text().trim());
  const numDeaths = parseInt(
      $('div .site-stats-count ul').find('.bg-red strong').text().trim());
  const numMigrated = parseInt(
      $('div .site-stats-count ul').find('.bg-orange strong').text().trim());

  const statesData = [];
  $('div .data-table table tbody').find('tr').each(
      (i, row) => {
        const cols = [];
        $(row).find('td').each(
            (j, col) => {
              cols.push($(col).text().trim());
            },
        );
        if (cols[0].match(/^\d+$/)) {
          statesData.push({
            name: cols[1].replace(/[^\w\s]/gi, ''),
            cases: {
              active: parseInt(cols[2]),
              cured: parseInt(cols[3]),
              deaths: parseInt(cols[4]),
              migrated: 0,
              total: parseInt(cols[2]) +
                                parseInt(cols[3]) +
                                parseInt(cols[4]),
            },
          });
        }
      },
  );

  const response = {
    updatedAt: updatedAt.toISOString(),
    name: 'India',
    cases: {
      active: numActive,
      cured: numCured,
      deaths: numDeaths,
      migrated: numMigrated,
      total: numActive + numCured + numDeaths + numMigrated,
    },
    states: statesData,
  };

  console.log(`Parsed data successfully: ${JSON.stringify(response)}`);
  callback(response, res);
}

/**
 * Parse COVID-19 India Cases Data from the
 * Ministry of Health and Family Welfare (mohfw.gov.in) website
 * and send the response back to the client
 * @param {string} data html page data (mohfw.gov.in)
 * @param {object} res server response object
 */
function sendData(data, res) {
  console.log('Sending data...');
  sendResponse(res, 200, data);
}

const app = express();
const SERVER_PORT = 8080;
const DATA_URL = '/v1/data';
const CURRENT_DATA_URL = '/v1/data/current';

app.use(express.json());

/**
 * Fetch historical data
 */
app.get(DATA_URL,
    (req, res) => readData(req.query.date, res));

/**
 * Write data into BigQuery. Please note that this is an
 * idempotent operation. If the update already exists in BQ, then nothing
 * nothing is written into BQ
 */
app.put(DATA_URL, (req, res) => writeData(req.body, res));

/**
 * Fetch current data from MoHFW
 */
app.get(CURRENT_DATA_URL, (req, res) => currentCovid19Data(sendData, res));

/**
 * Write data into BigQuery but by fetching it from the URL specified.
 * Please note that this is an idempotent operation.
 * If the update already exists in BQ, then nothing
 * nothing is written into BQ
 */
app.put(CURRENT_DATA_URL, (req, res) => currentCovid19Data(writeData, res));

/**
 * Swagger UI
 */
app.use('/v1/api-docs', swaggerUI.serve, swaggerUI.setup(swaggerDoc));

/**
 * Catch all routes
 */
app.all('*',
    (req, res) => {
      if (req.url != DATA_URL && req.url != CURRENT_DATA_URL) {
        sendResponse(res, 404, {error: 'Requested URL does not exist'});
      } else if (req.method != 'GET' || req.method != 'PUT') {
        sendResponse(res, 405, {error: 'Unsupported HTTP method'});
      }
    });

/**
 * Start the server
 */
app.listen(SERVER_PORT, () => console.log(`Listening on port ${SERVER_PORT}`));
