import HttpClient from "./httpClient";
const API_BASE = process.env.API_BASE_URL; // ej. "https://tuservidor/api"
const express = require('express');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
// Create an Express app
const app = express();

// Middleware to parse JSON bodies
app.use(express.json());
const verifyToken = process.env.VERIFY_TOKEN;
const whatsappToken = process.env.WHATSAPP_TOKEN;
// Set port and verify_token
const port = process.env.PORT || 3000;

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
        "Authorization": `Bearer ${whatsappToken}`,
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

// Utilidad: normalizar número
function getCelDestino(from) {
  const cel = from?.replace(/\D/g, "").slice(-10);
  return `52${cel}`;
}

// Utilidad: marcar mensaje como leído
async function markAsRead(businessId, messageId) {
  const readPayload = {
    messaging_product: "whatsapp",
    status: "read",
    message_id: messageId
  };
  await fetch(`https://graph.facebook.com/v22.0/${businessId}/messages`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${whatsappToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(readPayload)
  });
}

// Diccionario de handlers por estado
const stepHandlers = {
  inicio: async ({ userInput, celDestino, businessId, message }) => {
    if (userInput.toLowerCase() === "hola") {
      await sendWhatsappMessage(
        celDestino,
        "¡Hola! Soy el asistente virtual de Laboratorios Barrera.\n¿En qué puedo ayudarte hoy?\n1️⃣ Consultar estatus de mis análisis\n2️⃣ Descargar resultados\n3️⃣ Solicitar cotización\n\nEscribe el número de la opción deseada.",
        businessId,
        message.id
      );
      return { step: "menu" };
    }
    await sendWhatsappMessage(
      celDestino,
      "¡Hola! Escribe 'Hola' para iniciar la conversación.",
      businessId
    );
    return { step: "inicio" };
  },

  menu: async ({ userInput, celDestino, businessId }) => {
    switch (userInput) {
      case "1":
        await sendWhatsappMessage(
          celDestino,
          "Por favor, indícame el número de folio de tus análisis.",
          businessId
        );
        return { step: "esperando_folio_estatus" };
      case "2":
        await sendWhatsappMessage(
          celDestino,
          "Para generar tu enlace de descarga, indícame tu número de folio.",
          businessId
        );
        return { step: "esperando_folio_descarga" };
      case "3":
        await sendWhatsappMessage(
          celDestino,
          "Por favor, indícanos los estudios que deseas cotizar y un asesor te contactará.",
          businessId
        );
        return { step: "cotizacion" };
      default:
        await sendWhatsappMessage(
          celDestino,
          "Opción no válida. Por favor, escribe el número de la opción deseada.",
          businessId
        );
        return { step: "menu" };
    }
  },

  esperando_folio_estatus: async ({ userInput, celDestino, businessId }) => {
      try {
      const data = await HttpClient.post(`${API_BASE}/AnalisisEstatusFolio`, {
        Folio: userInput
      });

      if (data && data.length > 0) {
        const analisis = data[0];

        const mensaje = `El estatus de tu análisis ${analisis.Folio} es:
  • Estado: ${analisis.Estatus}
  • Fecha de solicitud: ${new Date(analisis.Fecha).toLocaleDateString("es-MX")}
  • Fecha de entrega: ${analisis.FechaEntrega ?? "NA"}

  ¿Necesitas algo más?
  1️⃣ Volver al menú
  2️⃣ Finalizar conversación`;

        await sendWhatsappMessage(celDestino, mensaje, businessId);
        return { step: "fin_estatus" };
      } else {
        await sendWhatsappMessage(
          celDestino,
          `No encontramos ningún registro con folio ${userInput}.
  Verifica tu folio e inténtalo de nuevo.`,
          businessId
        );
        return { step: "esperando_folio_estatus" };
      }
    } catch (error) {
      console.error("Error consultando estatus:", error.message);
      await sendWhatsappMessage(
        celDestino,
        "Ocurrió un error al consultar el estatus. Intenta más tarde.",
        businessId
      );
      return { step: "esperando_folio_estatus" };
    }
  },

  esperando_folio_descarga: async ({ userInput, celDestino, businessId }) => {
    if (userInput.toUpperCase() === "XYZ98765") {
      await sendWhatsappMessage(
        celDestino,
        "Tu enlace de descarga está listo:\nhttps://labxyz.com/resultados/XYZ98765\nEl enlace expirará en 48 horas.\n¿Necesitas algo más?\n1️⃣ Volver al menú\n2️⃣ Finalizar conversación",
        businessId
      );
      return { step: "fin_descarga" };
    }
    await sendWhatsappMessage(
      celDestino,
      `No encontramos resultados disponibles para el folio ${userInput}.\nAsegúrate de que tus análisis hayan sido procesados.`,
      businessId
    );
    return { step: "esperando_folio_descarga" };
  },

  fin_estatus: async ({ userInput, celDestino, businessId }) =>
    handleFin(userInput, celDestino, businessId),
  fin_descarga: async ({ userInput, celDestino, businessId }) =>
    handleFin(userInput, celDestino, businessId),

  cotizacion: async ({ celDestino, businessId }) => {
    await sendWhatsappMessage(
      celDestino,
      "¡Gracias! Hemos recibido tu solicitud. Un asesor se pondrá en contacto contigo pronto.\n¿Necesitas algo más?\n1️⃣ Volver al menú\n2️⃣ Finalizar conversación",
      businessId
    );
    return { step: "fin_cotizacion" };
  },

  fin_cotizacion: async ({ userInput, celDestino, businessId }) =>
    handleFin(userInput, celDestino, businessId)
};

// Handler común para pasos de finalización
async function handleFin(userInput, celDestino, businessId) {
  if (userInput === "1") {
    await sendWhatsappMessage(
      celDestino,
      "¿En qué puedo ayudarte hoy?\n1️⃣ Consultar estatus de mis análisis\n2️⃣ Descargar resultados\n3️⃣ Solicitar cotización\n\nEscribe el número de la opción deseada.",
      businessId
    );
    return { step: "menu" };
  } else if (userInput === "2") {
    await sendWhatsappMessage(
      celDestino,
      "¡Gracias por contactarnos! Si necesitas algo más, escribe 'Hola'.",
      businessId
    );
    return { step: "inicio" };
  }
  await sendWhatsappMessage(
    celDestino,
    "Opción no válida. Escribe 1 para volver al menú o 2 para finalizar.",
    businessId
  );
  return { step: "inicio" };
}

// Route
app.post("/", async (req, res) => {
  const message = req.body.entry?.[0]?.changes[0]?.value?.messages?.[0];
  const businessId = req.body.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id;

  if (message?.type === "text") {
    const celDestino = getCelDestino(message.from);
    const userInput = message.text.body.trim();
    const userState = userStates[celDestino] || { step: "inicio" };

    const handler = stepHandlers[userState.step] || stepHandlers["inicio"];
    userStates[celDestino] = await handler({
      userInput,
      celDestino,
      businessId,
      message
    });

    await markAsRead(businessId, message.id);
  }

  res.sendStatus(200);
});

// Start the server
app.listen(port, () => {
  console.log(`\nListening on port ${port}\n`);
});

app.get('/webhook/test', (req, res) => {
  res.send('Webhook funcionando y redirigido por IIS');
});