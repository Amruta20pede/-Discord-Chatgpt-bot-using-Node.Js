require('dotenv/config');
const { Client, IntentsBitField } = require('discord.js');
const { Configuration, OpenAIApi } = require('openai');
const client = new Client({
  intents: [
    IntentsBitField.Flags.Guilds,
    IntentsBitField.Flags.GuildMessages,
    IntentsBitField.Flags.MessageContent,
  ],
});

client.on('ready', () => {
  console.log('The bot is online!');
});

const configuration = new Configuration({
  apiKey: process.env.API_KEY,
});

const openai = new OpenAIApi(configuration);

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (message.channel.id !== process.env.CHANNEL_ID) return;
  if (message.content.startsWith('!')) return;

  let conversationLog = [
    { role: 'system', content: 'You are a friendly chatbot.' },
  ];

  try {
    await message.channel.sendTyping();
    let prevMessages = await message.channel.messages.fetch({ limit: 15 });
    prevMessages.reverse();

    prevMessages.forEach((msg) => {
      if (msg.content.startsWith('!')) return;
      if (msg.author.id !== client.user.id && message.author.bot) return;
      if (msg.author.id == client.user.id) {
        conversationLog.push({
          role: 'assistant',
          content: msg.content,
          name: msg.author.username
            .replace(/\s+/g, '_')
            .replace(/[^\w\s]/gi, ''),
        });
      }

      if (msg.author.id == message.author.id) {
        conversationLog.push({
          role: 'user',
          content: msg.content,
          name: message.author.username
            .replace(/\s+/g, '_')
            .replace(/[^\w\s]/gi, ''),
        });
      }
    });

    let retries = 0;
    const maxRetries = 3;
    const baseDelay = 1000; // 1 second
    const maxDelay = 5000; // 5 seconds
    let result = null;

    while (retries < maxRetries) {
      try {
        result = await openai.createChatCompletion({
          model: 'gpt-3.5-turbo',
          messages: conversationLog,
        });

        if (result && result.response && result.response.status === 429) {
          console.log('Rate limit exceeded. Retrying after delay...');

          // Calculate the delay using exponential backoff
          const delay = Math.pow(2, retries) * baseDelay;
          const actualDelay = Math.min(delay, maxDelay);

          await new Promise((resolve) => setTimeout(resolve, actualDelay));
          retries++;
          continue; // Retry the request
        }

        // Process the response if it's not rate-limited
        if (result && result.data && result.data.choices && result.data.choices.length > 0) {
          message.reply(result.data.choices[0].message);
        } else {
          throw new Error('Empty or invalid response from OpenAI.');
        }

        break; // Exit the retry loop
      } catch (error) {
        console.log(`ERR: ${error}`);
        message.reply('An error occurred while processing the request.');
        break; // Exit the retry loop
      }
    }

    if (retries >= maxRetries) {
      console.log('Maximum number of retries reached. Unable to process the request.');
    }
  } catch (error) {
    console.log(`ERR: ${error}`);
    message.reply('An error occurred while processing the request.');
  }
});

(async () => {
  try {
    await client.login(process.env.TOKEN);
  } catch (error) {
    console.error(`Failed to log in with the bot token: ${error}`);
  }
})();
