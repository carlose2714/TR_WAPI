// Import Express.js
const express = require('express');
// Create an Express app
const app = express();

// Middleware to parse JSON bodies
app.use(express.json());

// Set port and verify_token
const port = process.env.PORT || 3000;
const verifyToken = process.env.VERIFY_TOKEN;

// Route for GET requests
app.get('/', (req, res) => {
  const { 'hub.mode': mode, 'hub.challenge': challenge, 'hub.verify_token': token } = req.query;

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('WEBHOOK VERIFIED');
    res.status(200).send(challenge);
  } else {
    res.status(403).end();
  }
});

// Route for POST requests
app.post('/', async (req, res) => {
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.log(`\n\nWebhook received ${timestamp}\n`);
  console.log(JSON.stringify(req.body, null, 2));
  try {
  const message = req.body.entry?.[0]?.changes[0]?.value?.messages?.[0];
  const business_phone_number_id = req.body.entry?.[0].changes?.[0].value?.metadata?.phone_number_id;
  console.log(message);
  console.log(business_phone_number_id);
    } catch (error) {
                console.error("Error consuming WA API:", error);
            }
  if(message.body == "Hola"){
    try {
  // 1) Enviar mensaje de bienvenida
  const sendPayload = {
    messaging_product: "whatsapp",
    to: message.from,
    text: {
      body: "Hola, soy el asistente de Laboratorios Barrera.\n\nA continuación, seleccione una opción del menú."
    },
    context: {
      message_id: message.id
    }
  };

  let response = await fetch(
    `https://graph.facebook.com/v22.0/${business_phone_number_id}/messages`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${verifyToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(sendPayload)
    }
  );

  if (!response.ok) {
    const err = await response.json();
    console.error("Error al enviar mensaje:", err);
  }

  // 2) Marcar mensaje entrante como leído
  const readPayload = {
    messaging_product: "whatsapp",
    status: "read",
    message_id: message.id
  };

  response = await fetch(
    `https://graph.facebook.com/v22.0/${business_phone_number_id}/messages`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${verifyToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(readPayload)
    }
  );

  if (!response.ok) {
    const err = await response.json();
    console.error("Error al marcar mensaje como leído:", err);
  }

} catch (error) {
  console.error("Error consumiendo WA API:", error);
}
  }
  res.status(200).end();
});

// Start the server
app.listen(port, () => {
  console.log(`\nListening on port ${port}\n`);
});
