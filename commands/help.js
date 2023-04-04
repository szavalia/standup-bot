const PREFIX = "!";

/**
 * !help command - Lists out all the available commands
 */
module.exports = {
  name: "help",
  description: "Shows all commands",
  usage: "[command name]",
  execute(message, args) {
    const { commands } = message.client;
    /**
     * If the user wants all the commands
     */
    if (!args.length) {
      let reply = "Here's a list of all my commands:\n";
      let cmds = "";
      commands.forEach(command => {
        cmds += (`\`${PREFIX}${command.name}\``).padEnd(6, '\t');
        if(command.description) cmds += `\t*${command.description}*\n`
      });
      cmds += `Try \`${PREFIX}help [command name]\` to get info on a specific command!`

      reply += cmds;
    
      message.channel.send(reply, { split: true }).catch((error) => {
          console.error(error);
          message.reply(
            "Houston, we have a problem!"
          );
        });
      return;
    }

    /**
     * If the user specifies a command
     */
    const name = args[0].toLowerCase();
    const command =
      commands.get(name) ||
      commands.find((c) => c.aliases && c.aliases.includes(name));

    if (!command) {
      return message.reply("Uh Oh! Not a valid command");
    }

    let reply = `**Name:** ${command.name}\n`;
    if (command.description)
      reply += `**Description:** *${command.description}*\n`;

      if (command.usage)
      reply += `**Usage:** \`${PREFIX}${command.name} ${command.usage}\`\n`;

    reply += `**Cooldown:** ${command.cooldown || 3} second(s)\n`;

    message.channel.send(reply, { split: true });

  },
};
