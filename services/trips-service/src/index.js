const { app, initDb } = require('./app');

const PORT = process.env.PORT || 3002;

async function start() {
  for (let i = 0; i < 10; i++) {
    try {
      await initDb();
      break;
    } catch (err) {
      console.log('Base pas prête, nouvelle tentative dans 3 secondes...');
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  app.listen(PORT, () => console.log(`trips-service sur le port ${PORT}`));
}

start();