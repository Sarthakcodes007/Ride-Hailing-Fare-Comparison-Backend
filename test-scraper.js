const http = require('http');

const data = JSON.stringify({
  pickup: { lat: "12.9716", lng: "77.5946" },
  drop: { lat: "12.9352", lng: "77.6245" }
});

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/compare-fares',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = http.request(options, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => {
    console.log('BODY:', body);
  });
});

req.on('error', (e) => {
  console.error(`problem with request: ${e.message}`);
});

req.write(data);
req.end();
