const HttpClient = require('./httpClient'); // sin extensión si está en la misma carpeta
const API_BASE = process.env.API_BASE_URL; // ej. "https://tuservidor/api"
const express = require('express');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
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
  console.log("👉 Enviando mensaje WhatsApp:", payload);
  console.log("👉 A business_phone_number_id:", business_phone_number_id);
  const response = await fetch(
    `https://graph.facebook.com/v24.0/${business_phone_number_id}/messages`,
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
      console.log("👉 Iniciando consulta de estatus con folio:", userInput);

      const data = await HttpClient.post(`${API_BASE}/api/WAPI/AnalisisEstatusFolio`, {
        Folio: userInput
      });

      console.log("👉 Respuesta cruda del API:", JSON.stringify(data, null, 2));

      if (data && data.length > 0) {
        const analisis = data[0];

        console.log("👉 Primer registro recibido:", analisis);
        console.log("👉 Campos individuales:",
          "Folio:", analisis.folio,
          "Fecha:", analisis.fecha,
          "Estatus:", analisis.estatus,
          "FechaEntrega:", analisis.fechaEntrega
        );

        const mensaje = `El estatus de tu análisis ${analisis.folio} es:
  • Estado: ${analisis.estatus}
  • Fecha de solicitud: ${analisis.fecha ? new Date(analisis.fecha).toLocaleDateString("es-MX") : "NA"}
  • Fecha de entrega: ${analisis.fechaEntrega ?? "NA"}

  ¿Necesitas algo más?
  1️⃣ Volver al menú
  2️⃣ Finalizar conversación`;

        await sendWhatsappMessage(celDestino, mensaje, businessId);
        return { step: "fin_estatus" };
      } else {
        console.log("👉 No se encontraron registros para el folio:", userInput);

        await sendWhatsappMessage(
          celDestino,
          `No encontramos ningún registro con folio ${userInput}.
Verifica tu folio e inténtalo de nuevo.`,
          businessId
        );
        return { step: "esperando_folio_estatus" };
      }
    } catch (error) {
      console.error("❌ Error consultando estatus:", error);

      await sendWhatsappMessage(
        celDestino,
        "Ocurrió un error al consultar el estatus. Intenta más tarde.",
        businessId
      );
      return { step: "esperando_folio_estatus" };
    }
  },

  esperando_folio_descarga: async ({ userInput, celDestino, businessId }) => {
    try {
      console.log("👉 Iniciando consulta de estatus con folio:", userInput);

      const data = await HttpClient.post(`${API_BASE}/api/WAPI/AnalisisEstatusFolio`, {
        Folio: userInput
      });

      console.log("👉 Respuesta cruda del API:", JSON.stringify(data, null, 2));

      if (data && data.length > 0) {
        const analisis = data[0];

        console.log("👉 Primer registro recibido:", analisis);
        console.log("👉 Campos individuales:",
          "Folio:", analisis.folio,
          "Fecha:", analisis.fecha,
          "Estatus:", analisis.estatus,
          "FechaEntrega:", analisis.fechaEntrega
        );

        const mensaje = `Da click aquí para descargar los resultados https://laboratoriosbarrera.com.mx/resultados/${analisis.xID}

  ¿Necesitas algo más?
  1️⃣ Volver al menú
  2️⃣ Finalizar conversación`;

        await sendWhatsappMessage(celDestino, mensaje, businessId);
        return { step: "fin_estatus" };
      } else {
        console.log("👉 No se encontraron registros para el folio:", userInput);

        await sendWhatsappMessage(
          celDestino,
          `No encontramos ningún registro con folio ${userInput}.
Verifica tu folio e inténtalo de nuevo.`,
          businessId
        );
        return { step: "esperando_folio_estatus" };
      }
    } catch (error) {
      console.error("❌ Error consultando estatus:", error);

      await sendWhatsappMessage(
        celDestino,
        "Ocurrió un error al consultar el estatus. Intenta más tarde.",
        businessId
      );
      return { step: "esperando_folio_estatus" };
    }
  },

  fin_estatus: async ({ userInput, celDestino, businessId }) =>
    handleFin(userInput, celDestino, businessId),
  fin_descarga: async ({ userInput, celDestino, businessId }) =>
    handleFin(userInput, celDestino, businessId),

  cotizacion: async ({ celDestino, businessId, userInput }) => {
    // 1. Activar conversación en tu API
    try {


      const data = await HttpClient.post(`${API_BASE}/api/Chat/ActivarAgente`, {
        numeroWhatsApp: celDestino
      });

      console.log("👉 Respuesta cruda del API:", JSON.stringify(data, null, 2));

      if (data && data.length > 0) {
        const conversacion = data[0];
        console.log("👉 Primer registro recibido:", conversacion);

        // 2. Guardar el mensaje entrante en tu API (DB + Hub)
        await HttpClient.post(`${API_BASE}/api/Chat/EnviarMensaje`, {
          ConversacionID: conversacion.xID,
          Direccion: "IN", // viene del cliente
          Remitente: celDestino,
          Tipo: "TEXT",
          Texto: userInput,
          UrlAdjunto: businessId
        });

        // 3. Responder al cliente en WhatsApp
        await sendWhatsappMessage(
          celDestino,
          "¡Gracias! Hemos recibido tu solicitud. Un asesor se pondrá en contacto contigo pronto.",
          businessId
        );

        return { step: "chat_agente", conversacionId: conversacion.xID };
      } else {
        console.log("👉 No se encontraron registros para el folio:", userInput);

        await sendWhatsappMessage(
          celDestino,
          `No se pudo iniciar una conversación en este momento, intenta más tarde, Horario de atención 9am a 2pm.`,
          businessId
        );

        return { step: "fin_cotizacion" };
      }
    } catch (error) {
      console.error("❌ Error consultando estatus:", error);
      await sendWhatsappMessage(
        celDestino,
        `No se pudo iniciar una conversación en este momento, intenta más tarde, Horario de atención 9am a 2pm.`,
        businessId
      );

      return { step: "fin_cotizacion" };
    }
  },
  fin_cotizacion: async ({ userInput, celDestino, businessId }) =>
    handleFin(userInput, celDestino, businessId),

  chat_agente: async ({ userInput, celDestino, businessId, userState }) => {
    // Reenviar mensaje a tu API .NET como IN
    try {
      console.log("👉 Reenviando mensaje al agente:", userInput);
      await HttpClient.post(`${API_BASE}/api/Chat/EnviarMensaje`, {
        ConversacionID: userState.conversacionId,
        Direccion: "IN",
        Remitente: celDestino,
        Tipo: "TEXT",
        Texto: userInput,
        UrlAdjunto: businessId
      });

      // No responder automáticamente en WhatsApp, porque ahora el agente lleva la conversación
      return userState; // mantener en chat_agente
    } catch (err) {
      console.log("Error en log de mensaje al agente:", err);
    }

  }
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
  if (!message) return res.sendStatus(200);

  const celDestino = getCelDestino(message.from);
  const userState = userStates[celDestino] || { step: "inicio" };
  console.log("📩 Mensaje entrante:", JSON.stringify(message, null, 2));
  try {
    if (message?.type === "text") {
      //const celDestino = getCelDestino(message.from);
      const userInput = message.text.body.trim();
      //const userState = userStates[celDestino] || { step: "inicio" };

      const handler = stepHandlers[userState.step] || stepHandlers["inicio"];
      userStates[celDestino] = await handler({
        userInput,
        celDestino,
        businessId,
        message,
        userState
      });
    }
    else if (message.type === "image") {
      if (userState.step === "chat_agente" && userState.conversacionId) {
        const imageId = message.image.id;
        const caption = message.image.caption || "";
        console.log("👉 Procesando imagen con ID:", imageId);
        console.log(whatsappToken);
        // Paso 1: obtener metadata del media
        const mediaMeta = await HttpClient.get(
          `https://graph.facebook.com/v24.0/${imageId}`,
          { headers: { Authorization: `Bearer ${whatsappToken}` } }
        );

        const mediaUrl = mediaMeta.data.url;
        console.log("👉 URL temporal del media:", mediaUrl);
        // Paso 2: opcional, descargar binario si quieres guardarlo localmente
        // const imageFile = await HttpClient.get(mediaUrl, {
        //   headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` },
        //   responseType: "arraybuffer"
        // });

        // Reenviar a tu API .NET con la URL
        await HttpClient.post(`${API_BASE}/api/Chat/EnviarMensaje`, {
          ConversacionID: userState.conversacionId,
          Direccion: "IN",
          Remitente: celDestino,
          Tipo: "IMAGE",
          Texto: caption,
          UrlAdjunto: mediaUrl
        });
      } else {
        await sendWhatsappMessage(
          celDestino,
          "❌ Mensaje no válido. Solo puedes enviar imágenes cuando estás en conversación con un agente.",
          businessId
        );
      }
    }

    await markAsRead(businessId, message.id);
    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Error procesando mensaje:", err);
    res.sendStatus(500);
  }

});

// Endpoint para recibir mensajes desde tu API .NET y reenviarlos a WhatsApp
app.post("/send", async (req, res) => {
  try {
    const { to, message, businessId } = req.body;

    console.log("👉 Reenviando mensaje a WhatsApp:", req.body);

    // Usa tu helper existente
    await sendWhatsappMessage(to, message, businessId);

    res.status(200).json({ success: true });
  } catch (err) {
    console.error("❌ Error en /send:", err);
    res.status(500).json({ error: "No se pudo enviar el mensaje a WhatsApp" });
  }
});

app.post("/close", async (req, res) => {
  try {
    const { to, message, businessId } = req.body;

    console.log("👉 Cerrando conversación para:", to);

    // 1. Resetear estado del usuario
    userStates[to] = { step: "inicio" };

    // 2. Mandar mensaje de cierre al cliente
    await sendWhatsappMessage(to, message, businessId);

    res.status(200).json({ success: true });
  } catch (err) {
    console.error("❌ Error en /close:", err);
    res.status(500).json({ error: "No se pudo cerrar la conversación" });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`\nListening on port ${port}\n`);
});

app.get('/webhook/test', (req, res) => {
  res.send('Webhook funcionando y redirigido por IIS');
});