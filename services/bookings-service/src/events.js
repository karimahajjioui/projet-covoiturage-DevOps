const amqp = require('amqplib');
const QUEUE = 'notifications';
let channel = null;

// Se connecte en arrière-plan, sans jamais bloquer ni faire planter le service
async function connect() {
  if (!process.env.RABBITMQ_URL) return;
  for (let i = 0; i < 30; i++) {
    try {
      const conn = await amqp.connect(process.env.RABBITMQ_URL);
      channel = await conn.createChannel();
      await channel.assertQueue(QUEUE, { durable: true });
      return;
    } catch (err) {
      console.log('RabbitMQ pas prêt, nouvelle tentative dans 3 secondes...');
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

// Sans connexion, l'événement est simplement perdu : la réservation reste valide
function publish(event) {
  if (!channel) return;
  channel.sendToQueue(QUEUE, Buffer.from(JSON.stringify(event)), { persistent: true });
}

module.exports = { connect, publish };