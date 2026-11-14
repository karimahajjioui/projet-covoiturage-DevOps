const { app, initDb } = require('./app');
const { name } = require('../package.json');

const PORT = process.env.PORT || 8080;

async function start() {
  for (let i = 0; i < 10; i++) {
    try {
      await initDb();
      break;
    } catch (err) {
      console.log('Pas prêt, nouvelle tentative dans 3 secondes...');
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  app.listen(PORT, () => console.log(`${name} sur le port ${PORT}`));
}

start();