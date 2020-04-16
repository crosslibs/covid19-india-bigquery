# Copyright 2020, Chaitanya Prakash N <chaitanyaprakash.n@gmail.com>
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

FROM node:12-slim

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install

ENV BQ_LOCATION=US, GCP_PROJECT_ID=none, BQ_DATASET_ID=none, BQ_TABLE_NAME=none

COPY . .

EXPOSE 8080
CMD ["npm", "start"]
