"use strict"; // since I hate not using semicolons

/**
 * Required Imports
 *  - dotenv: .env support
 *  - fs: file system support (for reading ./commands)
 *  - mongoose: mongoDB client
 *  - discord.js: discord (duh)
 *  - schedule: for running the cron jobs
 *  - standup.model: the model for the standup stored in mongo
 */
require("dotenv").config();
const fs = require("fs");
const mongoose = require("mongoose");
const {
  Client,
  Collection,
  IntentsBitField,
  Events,
  ChannelType,
} = require("discord.js");
const { EmbedBuilder } = require("discord.js");
const schedule = require("node-schedule");
const standupModel = require("./models/standup.model");
const { exit } = require("process");

const PREFIX = "!";

const standupIntroMessage = new EmbedBuilder()
  .setColor("#ff9900")
  .setTitle("Daily Standup")
  .setURL("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
  .setDescription(
    "This is the newly generated text channel used for daily standups! :tada:"
  )
  .addFields(
    {
      name: "Introduction",
      value: `Hi! I'm Hal and I will be facilitating your daily standups from now on.\nTo view all available commands, try \`${PREFIX}help\`.`,
    },
    {
      name: "How does this work?",
      value: `Anytime before the standup time \`12:00 PM Buenos Aires Time\`, members would private DM me with the command \`${PREFIX}show\`, I will present the standup prompt and they will type their response using the command \`${PREFIX}reply @<optional_serverId> [your-message-here]\`. I will then save their response in my *secret special chamber of data*, and during the designated standup time, I would present everyone's answer to \`#daily-standups\`.`,
    },
    {
      name: "Getting started",
      value: `*Currently*, there are no members in the standup! To add a member try \`${PREFIX}am <User>\`.`,
    }
  )
  .setFooter({
    text: "https://github.com/szavalia/standup-bot",
    iconURL:
      "https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png",
  })
  .setTimestamp();

const dailyStandupSummary = new EmbedBuilder()
  .setColor("#ff9900")
  .setTitle("Daily Standup")
  .setURL("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
  .setFooter({
    text: "https://github.com/szavalia/standup-bot",
    iconURL:
      "https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png",
  })
  .setTimestamp();

// lists .js files in commands dir
const commandFiles = fs
  .readdirSync("./commands")
  .filter((file) => file.endsWith(".js"));

// init bot client with a collection of commands
const bot = new Client({
  intents: [
    IntentsBitField.Flags.Guilds,
    IntentsBitField.Flags.GuildMembers,
    IntentsBitField.Flags.GuildMessages,
    IntentsBitField.Flags.MessageContent,
    IntentsBitField.Flags.DirectMessages,
  ],
});
bot.commands = new Collection();

// Imports the command file + adds the command to the bot commands collection
for (const file of commandFiles) {
  const command = require(`./commands/${file}`);
  bot.commands.set(command.name, command);
}

// mongodb setup with mongoose
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useCreateIndex: true,
    useUnifiedTopology: true,
  })
  .catch((error) => {
    console.log("Error connecting to MongoDB: ", error);
    exit(1);
  });

mongoose.connection
  .once("open", () => console.log("MongoDB connected"))
  .catch((error) => console.log(error));

bot.once(Events.ClientReady, () => console.log("Daily Bot Ready"));

// when a user enters a command
bot.on(Events.MessageCreate, async (message) => {
  if (!message.content.startsWith(PREFIX) || message.author.bot) return;

  console.log("Message received: " + message.channel.name);

  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const commandName = args.shift().toLowerCase();

  console.log("Command: " + commandName);

  if (!bot.commands.has(commandName)) return;

  if (message.mentions.users.has(bot.user.id))
    return message.channel.send(":robot:");

  const command = bot.commands.get(commandName);

  if (command.guildOnly && message.channel.type === ChannelType.DM) {
    return message.channel.send("Hmm, that command cannot be used in a dm!");
  }
  console.log("Proceeding to execute command...");

  try {
    await command.execute(message, args);
  } catch (error) {
    console.error("Error executing command: " + error);
    message.channel.send(`Error 8008135: Something went wrong!`);
  }
});

bot.on(Events.GuildCreate, async (guild) => {
  console.log("Creating new channel");
  // creates the text channel
  const channel = await guild.channels.create({
    name: "daily-standups",
    type: ChannelType.GuildText,
    reason: "Scrum Standup Meeting Channel",
  });

  console.log("Channel created");

  // creates the database model
  const newStandup = new standupModel({
    _id: guild.id,
    channelId: channel.id,
    members: [],
    responses: new Map(),
  });

  newStandup
    .save()
    .then(() => console.log("Howdy!"))
    .catch((err) => console.error(err));

  console.log("Sending welcome message");

  await channel.send({ embeds: [standupIntroMessage] });
});

// delete the mongodb entry
bot.on(Events.GuildDelete, (guild) => {
  console.log("Channel was deleted!");

  standupModel
    .findByIdAndDelete(guild.id)
    .then(() => console.log("Peace!"))
    .catch((err) => console.error(err));
});

/**
 * Cron Job: 12:00 PM Buenos Aires local time - Go through each standup and output the responses to the channel
 */
let cron = schedule.scheduleJob(
  { hour: 12, minute: 0, dayOfWeek: new schedule.Range(1, 5) },
  (time) => {
    console.log(`[${time}] - CRON JOB START`);
    standupModel
      .find()
      .then((standups) => {
        standups.forEach((standup) => {
          let memberResponses = [];
          let missingMembers = [];
          standup.members.forEach((id) => {
            if (standup.responses.has(id)) {
              memberResponses.push({
                name: `-`,
                value: `<@${id}>\n${standup.responses.get(id)}`,
              });
              standup.responses.delete(id);
            } else {
              missingMembers.push(id);
            }
          });
          let missingString = "MIA: ";
          if (!missingMembers.length) missingString += ":man_shrugging:";
          else missingMembers.forEach((id) => (missingString += `<@${id}> `));

          let channel = bot.channels.cache.get(standup.channelId);
          let dailyResponsesEmbed = new EmbedBuilder(dailyStandupSummary)
          .setDescription(missingString)
          .addFields(memberResponses);
          channel.send({ embeds: [dailyResponsesEmbed]});

          standup
            .save()
            .then(() =>
              console.log(`[${new Date()}] - ${standup._id} RESPONSES CLEARED`)
            )
            .catch((err) => console.error(err));
        });
      })
      .catch((err) => console.error(err));
  }
);

bot.login(process.env.DISCORD_TOKEN);
