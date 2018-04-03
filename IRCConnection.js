const EventEmitter = require("events");
const irc = require("irc");
const config = require("./config");

class IRCConnection extends EventEmitter {
  constructor({ master, user }) {
    super();
    this.user = user;
    this.master = master;
    this.irc = new irc.Client(config.ircHost, this.user.nick, {
      debug: true,
      nick: this.user.nick,
      password: this.user.password,
      sasl: true,
      userName: this.user.nick
    });
    this._connectListeners();
  }

  _connectListeners() {
    this.irc.addListener("names", async (channelNick, users) => {
      console.log("Owo!", channelNick, users);
      const guild = await this.master.guildByNick(channelNick);
      if (!this.master.members[guild.id]) {
        this.master.members[guild.id] = {};
      }
      await Promise.all([
        Object.keys(users).map(async userNick => {
          const user = await this.master.getByNick(userNick);
          this.master.members[guild.id][user.id] = true;
        })
      ]);
    });

    this.irc.addListener("join", async (channelNick, userNick) => {
      console.log("uwu");
      const user = await this.master.getByNick(userNick);
      const guild = await this.master.guildByNick(channelNick);
      if (
        !this.master.members[guild.id] ||
        !this.master.members[guild.id][user.id]
      ) {
        this.emit("userCreate", user, guild);
      } else {
        this.emit("userJoin", user, guild);
      }
    });
    this.irc.addListener("part", async (channelNick, userNick) => {
      const user = await this.master.getByNick(userNick);
      const guild = await this.master.guildByNick(channelNick);
      this.emit("userPart", user, guild);
    });
    this.irc.addListener("kick", async (channelNick, userNick) => {
      const user = await this.master.getByNick(userNick);
      const guild = await this.master.guildByNick(channelNick);
      this.emit("userLeave", user, guild);
    });
    this.irc.addListener("message", async (userNick, channelNick, message) => {
      const user = await this.master.getByNick(userNick);
      const guild = await this.master.guildByNick(channelNick);
      console.log("message.");
      this.emit("message", user, guild, message);
    });
    this.irc.addListener("raw", message => {
      console.log(message.command, message.args);
      if (message.command == "307") {
        // Auth success message
        for (const channel of config.channels) {
          this.irc.join(channel, err => console.log(err));
        }
      }
    });
    this.irc.addListener("error", err => console.log(err));
  }

  async send(guild, content) {
    console.log("Sending...", content);
    if (!content) return console.log("I was duped into sending", content);
    this.irc.say(
      guild.nick,
      content
        .split("\n")
        .filter(r => r)
        .join("\n")
    );
  }
}

module.exports = IRCConnection;
