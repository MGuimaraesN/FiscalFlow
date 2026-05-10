const https = require('https');
const options = {
  hostname: 'mdfe-homologacao.svrs.rs.gov.br',
  path: '/ws/MDFeDistribuicaoDFe/MDFeDistribuicaoDFe.asmx?wsdl',
  method: 'GET',
  rejectUnauthorized: false
};
const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (d) => { data += d; });
  res.on('end', () => { console.log(data); });
});
req.on('error', (e) => { console.error(e); });
req.end();
