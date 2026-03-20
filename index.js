const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes, EmbedBuilder } = require('discord.js');
const http = require('http');

// Servidor HTTP mínimo para que Render no mate el proceso
http.createServer((_, res) => res.end('Bot online')).listen(process.env.PORT || 3000);

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const TOKEN = process.env.TOKEN;
const CLIENT_ID = '1484508290082672670';
const ALLOWED_USER_ID = '1142244896779026525';
const FIREBASE_URL = 'https://robloxhack12-e2e2c-default-rtdb.europe-west1.firebasedatabase.app/status.json';
const FIREBASE_CONFIG_URL = 'https://robloxhack12-e2e2c-default-rtdb.europe-west1.firebasedatabase.app/botconfig.json';
const POLL_INTERVAL = 10_000;

// ─── STATE ────────────────────────────────────────────────────────────────────
let updateChannel = null;
let lastVersion = null;

async function saveChannelId(channelId) {
  await fetch(FIREBASE_CONFIG_URL, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channelId }),
  });
}

async function loadChannelId() {
  const res = await fetch(FIREBASE_CONFIG_URL);
  const data = await res.json();
  return data?.channelId || null;
}

// ─── CLIENT ───────────────────────────────────────────────────────────────────
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// ─── SLASH COMMANDS ───────────────────────────────────────────────────────────
const commands = [
  new SlashCommandBuilder()
    .setName('set')
    .setDescription('Establece este canal para recibir actualizaciones automáticas')
    .toJSON(),
];

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log('✅ Slash commands registrados.');
  } catch (err) {
    console.error('❌ Error registrando commands:', err);
  }
}

// ─── FIREBASE POLLING ─────────────────────────────────────────────────────────
async function fetchFirebase() {
  const res = await fetch(FIREBASE_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function buildEmbed(data) {
  const isOnline = data.Status === true;
  const statusEmoji = isOnline ? '🟢' : '🔴';
  const statusLabel = isOnline ? 'Online' : 'Offline';
  const embedColor = isOnline ? 0x57f287 : 0xed4245;

  return new EmbedBuilder()
    .setTitle('🚀 New Update — Derzko Bootstrapper')
    .setColor(embedColor)
    .addFields(
      { name: '📦 Version', value: `\`${data.SoftwareVersion || 'N/A'}\``, inline: true },
      { name: '📡 Status', value: `${statusEmoji} ${statusLabel}`, inline: true },
      { name: '\u200B', value: '\u200B', inline: true }, // spacer
      { name: '📝 Changelog', value: data.Changelog || 'Sin cambios registrados.' },
    )
    .setTimestamp()
    .setFooter({ text: 'Derzko Update System' });
}

async function pollFirebase() {
  if (!updateChannel) return;

  try {
    const data = await fetchFirebase();
    if (!data) return;

    const currentVersion = data.SoftwareVersion;

    // Solo publica si la versión cambió
    if (lastVersion !== null && currentVersion !== lastVersion) {
      console.log(`🔔 Nueva versión detectada: ${lastVersion} → ${currentVersion}`);
      const embed = await buildEmbed(data);
      await updateChannel.send({ embeds: [embed] });
    }

    lastVersion = currentVersion;
  } catch (err) {
    console.error('⚠️ Error consultando Firebase:', err.message);
  }
}

// ─── EVENTS ───────────────────────────────────────────────────────────────────
client.once('ready', async () => {
  console.log(`🤖 Bot listo como ${client.user.tag}`);
  await registerCommands();

  // Recupera el canal guardado en Firebase
  try {
    const channelId = await loadChannelId();
    if (channelId) {
      updateChannel = await client.channels.fetch(channelId);
      console.log(`📌 Canal recuperado: ${updateChannel.name}`);
    }
  } catch (err) {
    console.error('⚠️ No se pudo recuperar el canal:', err.message);
  }

  // Carga el estado inicial sin publicar nada
  try {
    const data = await fetchFirebase();
    if (data) lastVersion = data.SoftwareVersion;
    console.log(`� Versión inicial cargada: ${lastVersion}`);
  } catch (err) {
    console.error('⚠️ No se pudo cargar estado inicial:', err.message);
  }

  // Inicia el polling
  setInterval(pollFirebase, POLL_INTERVAL);
});

client.on('interactionCreate', async (interaction) => {
  try {
    if (!interaction.isChatInputCommand()) return;
    if (!interaction.user) return;

    if (interaction.user.id !== ALLOWED_USER_ID) {
      return interaction.reply({ content: '❌ No tienes permiso para usar este comando.', ephemeral: true });
    }

    if (interaction.commandName === 'set') {
      updateChannel = interaction.channel;
      await saveChannelId(interaction.channel.id);
      return interaction.reply({ content: '✅ Done! Este canal recibirá las actualizaciones automáticamente.', ephemeral: true });
    }
  } catch (err) {
    console.error('⚠️ Error en interacción:', err.message);
  }
});

client.login(TOKEN);
