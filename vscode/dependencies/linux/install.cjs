'use strict';
const https = require('https');
const path = require('path');
const fs = require('fs');

const GITHUB_REPO = 'https://github.com/develar/7zip-bin';

const fetch = (input) => {
  return new Promise((resolve, reject) => {
    https
      .request(input, (res) => {
        if (res.statusCode >= 400) {
          reject(`${res.statusCode}: ${res.statusMessage}`);
        }

        if (res.statusCode === 302) {
          resolve(fetch(res.headers.location));
        } else {
          resolve(res);
        }
      })
      .end();
  });
};

const install = async () => {
  const filename = `7za`;
  const download = `${GITHUB_REPO}/blob/master/linux/${process.arch}/${filename}?raw=true`;

  const sep = path.sep;
  const dest = path.join(`${__dirname}..${sep}..${sep}..${sep}dependencies${sep}linux${sep}`, filename);
  const stream = fs.createWriteStream(dest);
  stream.once('close', () => {
    // Access file?
    console.log(`Success: '${dest}' installed from remote '${download}'`);
  });

  try {
    const response = await fetch(download);
    response.pipe(stream);
  } catch (error) {
    console.error(error);
    throw new Error(error);
  }
};

install();
