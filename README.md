# API for COVID-19 India Data from official source, Ministry of Health and Family Welfare (mohfw.gov.in)

The APIs also help generate historical data by persisting changes into BigQuery. There are 4 APIs provided, 
  * one to fetch data from historical data source (BQ)
  * one for writing provided data into the data source (BQ), 
  * one for fetching current data from Ministry of Health and Family Welfare website and 
  * one for ingesting the current data from Ministry of Health and Family Welfare website into the data source (BQ)

Please refer to the API documentation [here](https://petstore.swagger.io/?url=https://raw.githubusercontent.com/crosslibs/covid19-india-bigquery/master/swagger.yaml) to understand how to use them.

## Create BigQuery table to store historical data

## Setup

### Create BigQuery dataset and table

### Prerequisites
You need to have Google Cloud SDK installed and BigQuery and Deployment Manager enabled in your Google Cloud Platform project.

### Create a BQ Dataset, Table and setup schema accordingly

```bash
# Set environment variables
export PROJECT_ID=<gcp-project-id-here>
export DATASET_NAME=<bq-dataset-name-here>
export TABLE_NAME=<bq-table-name-here>
export LOCATION=<insert-bq-location-here>

export BQ_DATASET=${PROJECT_ID}:${DATASET_NAME}
export BQ_TABLE=${BQ_DATASET}.${TABLE_NAME}

# Create a BQ dataset
bq mk -d --data_location=${LOCATION} --description="COVID-19 India historical data" ${BQ_DATASET}

# Create BQ table in the dataset
bq mk -t --description="COVID-19 India historical data" ${BQ_TABLE} ./schema.json

```

### Now you can use this table to write data from MoHFW website or other historical data 

# Build and Start the APIs

## Run locally

### Prerequisites
You need to have `Node.js version 12.0 or later` installed in your machine. Please follow setup instructions from https://nodejs.org/en/download/ if you do not have Node.js installed already.


``` bash
# Install dependencies
npm install

# Run the HTTP server (starts the HTTP server on PORT 8080)
GCP_PROJECT_ID=<project-id> BQ_LOCATION=<bq-location> BQ_DATASET_ID=<bq-dataset-id> BQ_TABLE_NAME=<bq-table-name> npm start

```

## Run in Docker

```bash
# Build Docker image
docker build -t covid19-india-bigquery:latest .
```

```bash
# Start container
docker run -p 8080:8080 -e GCP_PROJECT_ID=<project-id> -e BQ_LOCATION=<bq-location> -e BQ_DATASET_ID=<bq-dataset-id> -e BQ_TABLE_NAME=<bq-table-name> -d covid19-india-bigquery:latest
```

# API Documentation

You can view the documentation at [http://localhost:8080/v1/api-docs](http://localhost:8080/v1/api-docs) once the server is up and running.

Alternatively, you can also view the API documentation by clicking [here](https://petstore.swagger.io/?url=https://raw.githubusercontent.com/crosslibs/covid19-india-bigquery/master/swagger.yaml).

## Access the number of COVID-19 cases in India and across the states as of a specific date/time through this API

HTTP GET [http://localhost:8080/v1/data?date=<dateinISO8601format>](http://localhost:8080/v1/data?date=2020-04-15T12:30:00Z)

e.g. 

HTTP GET http://localhost:8080/v1/data?date=2020-04-15T12:30:00Z

## Ingest data of COVID-19 cases in India and across the states as of a specific date/time into BigQuery table created above through this API

HTTP PUT [http://localhost:8080/v1/data](http://localhost:8080/v1/data)

Please see the API documentation to understand the request body required.

## Fetch current data of COVID-19 cases in India and across the states directly from MoHFW website.

HTTP GET [http://localhost:8080/v1/data/current](http://localhost:8080/v1/data/current)

## Ingest current data of COVID-19 cases in India and across the states into BigQuery table directly from MoHFW website.

HTTP PUT [http://localhost:8080/v1/data/current](http://localhost:8080/v1/data/current)

Please see the API documentation to understand the request body required.

## Contact
For any queries, please reach out to me at cpdevws@gmail.com or post an issue in the repo.