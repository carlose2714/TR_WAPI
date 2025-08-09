// Import Express.js
const express = require('express');
const fetch = require('node-fetch'); // Asegúrate de tener node-fetch instalado
// Create an Express app
const app = express();

// Middleware to parse JSON bodies
app.use(express.json());

// Set port and verify_token
const port = process.env.PORT || 3000;
const verifyToken = process.env.VERIFY_TOKEN;

// Estado simple en memoria por usuario (celular)
const userStates = {};

// Función para enviar mensaje por WhatsApp
async function sendWhatsappMessage(to, body, business_phone_number_id, contextMessageId = null) {
  const payload = {
    messaging_product: "whatsapp",
    to,
    text: { body }
  };
  if (contextMessageId) payload.context = { message_id: contextMessageId };

  const response = await fetch(
    `https://graph.facebook.com/v22.0/${business_phone_number_id}/messages`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${verifyToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    }
  );
  if (!response.ok) {
    const err = await response.json();
    console.error("Error al enviar mensaje:", err);
  }
}


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

  const message = req.body.entry?.[0]?.changes[0]?.value?.messages?.[0];
  const business_phone_number_id = req.body.entry?.[0].changes?.[0].value?.metadata?.phone_number_id;
  if (message?.type === "text") {
    const cel = message.from?.slice(-10);
    const celDestino = `52${cel}`;
    const userInput = message.text.body.trim();
    const userState = userStates[celDestino] || { step: "inicio" };

    // Flujo conversacional
    if (userInput.toLowerCase() === "hola" && userState.step === "inicio") {
      // Menú principal
      await sendWhatsappMessage(
        celDestino,
        "¡Hola! Soy el asistente virtual de Laboratorios Barrera.\n¿En qué puedo ayudarte hoy?\n1️⃣ Consultar estatus de mis análisis\n2️⃣ Descargar resultados\n3️⃣ Solicitar cotización\n\nEscribe el número de la opción deseada.",
        business_phone_number_id,
        message.id
      );
      userStates[celDestino] = { step: "menu" };
    } else if (userState.step === "menu") {
      if (userInput === "1") {
        await sendWhatsappMessage(
          celDestino,
          "Por favor, indícame el número de folio de tus análisis.",
          business_phone_number_id
        );
        userStates[celDestino] = { step: "esperando_folio_estatus" };
      } else if (userInput === "2") {
        await sendWhatsappMessage(
          celDestino,
          "Para generar tu enlace de descarga, indícame tu número de folio.",
          business_phone_number_id
        );
        userStates[celDestino] = { step: "esperando_folio_descarga" };
      } else if (userInput === "3") {
        await sendWhatsappMessage(
          celDestino,
          "Por favor, indícanos los estudios que deseas cotizar y un asesor te contactará.",
          business_phone_number_id
        );
        userStates[celDestino] = { step: "cotizacion" };
      } else {
        await sendWhatsappMessage(
          celDestino,
          "Opción no válida. Por favor, escribe el número de la opción deseada.",
          business_phone_number_id
        );
      }
    } else if (userState.step === "esperando_folio_estatus") {
      // Simulación de consulta de estatus (dummy)
      if (userInput.toUpperCase() === "ABC12345") {
        await sendWhatsappMessage(
          celDestino,
          "El estatus de tu análisis ABC12345 es:\n• Estado: En proceso\n• Fecha de solicitud: 15/07/2025\n• Fecha de entrega: 18/07/2025\n\n¿Necesitas algo más?\n1️⃣ Volver al menú\n2️⃣ Finalizar conversación",
          business_phone_number_id
        );
        userStates[celDestino] = { step: "fin_estatus" };
      } else {
        await sendWhatsappMessage(
          celDestino,
          `No encontramos ningún registro con folio ${userInput}.\nVerifica tu folio e inténtalo de nuevo.`,
          business_phone_number_id
        );
        // Mantener en el mismo paso
      }
    } else if (userState.step === "esperando_folio_descarga") {
      // Simulación de generación de enlace (dummy)
      if (userInput.toUpperCase() === "XYZ98765") {
        await sendWhatsappMessage(
          celDestino,
          "Tu enlace de descarga está listo:\nhttps://labxyz.com/resultados/XYZ98765\nEl enlace expirará en 48 horas.\n¿Necesitas algo más?\n1️⃣ Volver al menú\n2️⃣ Finalizar conversación",
          business_phone_number_id
        );
        userStates[celDestino] = { step: "fin_descarga" };
      } else {
        await sendWhatsappMessage(
          celDestino,
          `No encontramos resultados disponibles para el folio ${userInput}.\nAsegúrate de que tus análisis hayan sido procesados.`,
          business_phone_number_id
        );
        // Mantener en el mismo paso
      }
    } else if (userState.step === "fin_estatus" || userState.step === "fin_descarga") {
      if (userInput === "1") {
        await sendWhatsappMessage(
          celDestino,
          "¿En qué puedo ayudarte hoy?\n1️⃣ Consultar estatus de mis análisis\n2️⃣ Descargar resultados\n3️⃣ Solicitar cotización\n\nEscribe el número de la opción deseada.",
          business_phone_number_id
        );
        userStates[celDestino] = { step: "menu" };
      } else if (userInput === "2") {
        await sendWhatsappMessage(
          celDestino,
          "¡Gracias por contactarnos! Si necesitas algo más, escribe 'Hola'.",
          business_phone_number_id
        );
        userStates[celDestino] = { step: "inicio" };
      } else {
        await sendWhatsappMessage(
          celDestino,
          "Opción no válida. Escribe 1 para volver al menú o 2 para finalizar.",
          business_phone_number_id
        );
      }
    } else if (userState.step === "cotizacion") {
      await sendWhatsappMessage(
        celDestino,
        "¡Gracias! Hemos recibido tu solicitud. Un asesor se pondrá en contacto contigo pronto.\n¿Necesitas algo más?\n1️⃣ Volver al menú\n2️⃣ Finalizar conversación",
        business_phone_number_id
      );
      userStates[celDestino] = { step: "fin_cotizacion" };
    } else if (userState.step === "fin_cotizacion") {
      if (userInput === "1") {
        await sendWhatsappMessage(
          celDestino,
          "¿En qué puedo ayudarte hoy?\n1️⃣ Consultar estatus de mis análisis\n2️⃣ Descargar resultados\n3️⃣ Solicitar cotización\n\nEscribe el número de la opción deseada.",
          business_phone_number_id
        );
        userStates[celDestino] = { step: "menu" };
      } else if (userInput === "2") {
        await sendWhatsappMessage(
          celDestino,
          "¡Gracias por contactarnos! Si necesitas algo más, escribe 'Hola'.",
          business_phone_number_id
        );
        userStates[celDestino] = { step: "inicio" };
      } else {
        await sendWhatsappMessage(
          celDestino,
          "Opción no válida. Escribe 1 para volver al menú o 2 para finalizar.",
          business_phone_number_id
        );
      }
    } else {
      // Si no hay estado, pedir que escriba "Hola"
      await sendWhatsappMessage(
        celDestino,
        "¡Hola! Escribe 'Hola' para iniciar la conversación.",
        business_phone_number_id
      );
      userStates[celDestino] = { step: "inicio" };
    }

    // Marcar mensaje como leído
    const readPayload = {
      messaging_product: "whatsapp",
      status: "read",
      message_id: message.id
    };
    await fetch(
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
  }

  res.status(200).end();
});

// Start the server
app.listen(port, () => {
  console.log(`\nListening on port ${port}\n`);
});
