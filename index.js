
const { Client } = require("discord.js-selfbot-v13");
const fs = require("fs-extra");
const chalk = require("chalk");
const { tokens } = require("./tokens.js");
const config = require("./config.json");

const version = "3.2.1-optimizado";

// ===== DELAYS FIJOS (ÓPTIMOS) =====
const RETRY_DELAY = 15000; // 15s para reintentos (fijo)
const ACCOUNT_START_DELAY = 3000; // 3s entre cuentas (fijo)
const COOLDOWN_PERIOD = 30 * 60 * 1000; // 30 minutos en milisegundos

// Variables globales para controlar el estado
let isGlobalCooldown = false;
let activeClients = [];

// ===== FUNCIÓN DELAY ALEATORIO (desde config.json) =====
function getRandomDelay() {
  const min = Number(config.Spamming?.MinDelay) || 1500; // Default: 1.5s
  const max = Number(config.Spamming?.MaxDelay) || 4000; // Default: 4s
  return Math.floor(Math.random() * (max - min)) + min;
}

// Función para desconectar todas las cuentas
async function disconnectAllClients() {
  if (isGlobalCooldown) return;
  
  isGlobalCooldown = true;
  console.log(chalk.red.bold(`[‼] Activando protocolo de enfriamiento. Desconectando todas las cuentas por 30 minutos...`));
  
  for (const client of activeClients) {
    try {
      await client.destroy();
      console.log(chalk.yellow(`[↻] Cuenta ${client.user?.tag || 'desconocida'} desconectada`));
    } catch (err) {
      console.log(chalk.red(`[✗] Error al desconectar: ${err.message}`));
    }
  }
  
  activeClients = [];
  
  // Programar reconexión después de 30 minutos
  setTimeout(() => {
    console.log(chalk.green.bold(`[↻] Finalizado periodo de enfriamiento. Reconectando cuentas...`));
    isGlobalCooldown = false;
    startAllAccounts();
  }, COOLDOWN_PERIOD);
}

// Función para iniciar todas las cuentas
function startAllAccounts() {
  tokens.forEach((tokenData, index) => {
    setTimeout(() => {
      console.log(chalk.blue(`🚀 Iniciando cuenta ${index + 1}/${tokens.length}...`));
      startSpammer(tokenData);
    }, index * ACCOUNT_START_DELAY);
  });
}

async function sendMessageSafe(channel, message) {
  try {
    await channel.send(message);
    return true;
  } catch (err) {
    if (err.code === 429 || err.code === 500) {
      // Si es rate limit o error 500, activar protocolo
      if (!isGlobalCooldown) {
        disconnectAllClients();
      }
      return false;
    }
    console.log(chalk.red(`[✗] Error (${err.code}): ${err.message}`));
    return false;
  }
}

async function startSpammer(tokenData) {
  const client = new Client({ checkUpdate: false });

  client.on("ready", async () => {
    console.log(chalk.cyan(`✅ ${client.user.tag} conectado`));
    client.user.setStatus("invisible");
    activeClients.push(client);

    const messages = fs.readFileSync("./data/messages.txt", "utf-8")
      .split("\n")
      .filter(m => m.trim().length > 0);

    let channelIndex = 0;
    const spamCycle = async () => {
      if (isGlobalCooldown) return; // No hacer nada si estamos en cooldown
      
      try {
        const channel = await client.channels.fetch(tokenData.channelIds[channelIndex]);
        const message = messages[Math.floor(Math.random() * messages.length)];
        
        if (await sendMessageSafe(channel, message)) {
          const delay = getRandomDelay();
          await new Promise(resolve => setTimeout(resolve, delay));
        }

        channelIndex = (channelIndex + 1) % tokenData.channelIds.length;
        spamCycle();
      } catch (err) {
        console.log(chalk.yellow(`[!] Error: ${err.message}. Reintentando en ${RETRY_DELAY}ms...`));
        
        // Si el error es grave, activar protocolo
        if (err.code === 500 || err.message.includes("ECONNRESET") || err.message.includes("ETIMEDOUT")) {
          if (!isGlobalCooldown) {
            disconnectAllClients();
          }
        } else {
          setTimeout(spamCycle, RETRY_DELAY);
        }
      }
    };

    if (!isGlobalCooldown) {
      spamCycle();
    }
  });

  client.login(tokenData.token).catch(err => {
    console.log(chalk.red(`❌ Error en login: ${err.message}`));
    // Si hay error de login, activar protocolo
    if (!isGlobalCooldown && (err.code === 500 || err.message.includes("Too many requests"))) {
      disconnectAllClients();
    }
  });
}

// Iniciar todas las cuentas al principio
startAllAccounts();

// ===== MANEJO DE ERRORES =====
process.on("unhandledRejection", (err) => {
  console.log(chalk.yellow("[⚠] Error no manejado:"), err.message);
  // Activar protocolo si es un error grave
  if (!isGlobalCooldown && (err.code === 500 || err.message.includes("Rate limited"))) {
    disconnectAllClients();
  }
});

process.on("uncaughtException", (err) => {
  console.log(chalk.red("[‼] Error crítico:"), err);
  // Activar protocolo si es un error grave
  if (!isGlobalCooldown) {
    disconnectAllClients();
  }
});