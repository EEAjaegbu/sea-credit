const { createApp } = require('./server/app.cjs');
const port = Number(process.env.PORT) || 4173;
const { server } = createApp();
server.listen(port, '0.0.0.0', () => {
  console.log(`Sea Credit development server: http://localhost:${port}`);
  console.log('Test accounts and applications are saved in .data/database.json. Use fictional details only.');
});
