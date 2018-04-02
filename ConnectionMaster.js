const EventEmitter = require("events");
const { User, Guild } = require("./schemas.js");
const crypto = require("crypto");
const IRCConnection = require("./IRCConnection.js");
const erlpack = require("erlpack");
const WebSocket = require("uws");
const OPS = {
  dispatch: 0,
  heartbeat: 1,
  identify: 2,
  statusUpdate: 3,
  voiceStateUpdate: 4,
  voiceServerPing: 5,
  resume: 6,
  reconnect: 7,
  requestGuildMembers: 8,
  invalidSession: 9,
  hello: 10,
  heartbeatAck: 11,
  guildSync: 12
};
const config = require("./config.js");
const utils = require("./utilities.js");
console.log(utils);

const OPLOOKUP = {};
for (const friendlyName in OPS) {
  OPLOOKUP[OPS[friendlyName]] = friendlyName;
}

class Master extends EventEmitter {
  constructor() {
    super();
    this.connections = {};
    this.wss = new WebSocket.Server({ port: config.wsport || 8000 });
    this.wss.on("connection", this._handleConnect.bind(this));
    this.clients = [];
    this.users = {};
    this.nicks = {};
    this.guildNicks = {};
    this.guilds = {};
    this.members = {};
  }

  _handleConnect(ws) {
    this.clients.push(new ClientConnection({ ws, master: this }));
  }

  async guildByNick(nick) {
    if (!this.guildNicks[nick]) {
      let guild = await Guild.findOne({ nick: nick });
      if (!guild) {
        guild = new Guild({
          nick: nick,
          id: await utils.generateSnowflake()
        });
        await guild.save();
      }
      this.guilds[guild.id] = guild;
      this.guildNicks[guild.nick] = guild.id;
    }
    return this.guilds[this.guildNicks[nick]];
  }

  async getGuild(guildId) {
    if (!this.guilds[guildId]) {
      this.guilds[guildId] = await Guild.findOne({ id: guildId });
      this.guildNicks[this.guilds[guildId].nick] = this.guildId;
      if (!this.guilds[guildId]) {
        throw new UnknownChannel();
      }
    }
    console.log(this.guilds);
    return this.guilds[guildId];
  }

  async getByNick(nick) {
    console.log(nick);
    if (!this.nicks[nick]) {
      let user = await User.findOne({ nick: nick });
      if (!user) {
        user = new User({
          nick: nick,
          id: await utils.generateSnowflake(),
          hash: utils.createHash()
        });
        await user.save();
      }
      this.users[user.id] = user;
      this.nicks[user.nick] = user.id;
    }
    return this.users[this.nicks[nick]];
  }

  async getUser(userId) {
    if (!this.users[userId]) {
      this.users[userId] = await User.findOne({ id: userId });
      this.nicks[this.users[userId].nick] = this.userId;
      if (!this.users[userId]) {
        throw new UnknownUser();
      }
    }
    return this.users[userId];
  }

  async getConnection(userId) {
    if (!this.connections[userId]) {
      this.connections[userId] = new IRCConnection({
        user: await this.getUser(userId),
        master: this
      });
      this.connections[userId].on("userCreate", (user, guild) => {
        this._populateUser(user, guild);
      });
      this.connections[userId].on("userJoin", (user, guild) => {
        this._populateUser(user, guild);
      });
      this.connections[userId].on("userPart", (user, guild) => {
        this._populateUser(user, guild);
        this.members[guild.id][user.id] = false;
      });
      this.connections[userId].on("message", (user, guild) => {
        this._populateUser(user, guild);
      });
      this.connections[userId].on("userLeave", (user, guild) => {
        this._populateUser(user, guild);
        delete this.members[guild.id][user.id];
      });
    }
    return this.connections[userId];
  }

  _populateUser(user, guild) {
    this.users[user.id] = user;
    this.nicks[user.nick] = user.id;
    if (guild) {
      if (!this.members[guild.id]) this.members[guild.id] = {};
      this.members[guild.id][user.id] = true;
    }
  }
}

class ClientConnection extends EventEmitter {
  constructor({ ws, master }) {
    super();
    this.master = master;
    this.ws = ws;
    this._hello();
    this.heartbeatInterval = 45000;
    this.ws.on("message", this._onMessage.bind(this));
    this.sequence = 1;
    this.handlers = {
      heartbeat: this._ackHeartbeat,
      identify: this._identify,
      resume: this._resume,
      guildSync: this._noop
    };
  }

  _resume() {
    this.send("invalidSession", false);
  }

  _noop() {}

  get nick() {
    return this.user.nick;
  }

  _hookConnection(connection) {
    connection.on("userJoin", (user, guild) => {
      this._sendPresence(user, guild, "online");
    });

    connection.on("userCreate", (user, guild) => {
      if (user.id == this.user.id) {
        this.dispatch("GUILD_CREATE", this._jsonGuild(guild));
      }
      this.dispatch("GUILD_MEMBER_ADD", {
        guild_id: guild.id,
        ...utils.toMember(user)
      });
    });

    connection.on("join", guild => {
      console.debug("Joined!!!");
      this.dispatch("GUILD_CREATE", this._jsonGuild(guild));
    });

    connection.on("userPart", (user, guild) => {
      this._sendPresence(user, guild, "offline");
    });
    connection.on("message", async (user, guild, content) => {
      console.log("message..?", guild.id);
      this.dispatch(
        "MESSAGE_CREATE",
        await this._newMessage({ content, user, guild })
      );
    });
  }

  async _newMessage({ content, user, guild }) {
    return await utils.createMessage({ user, guild, content });
    // return {
    //   id: await utils.generateSnowflake(),
    //   channel_id: guild.id,
    //   author: user.toJSON(),
    //   content,
    //   timestamp: utils.getTime(),
    //   edited_timestamp: null,
    //   tts: false,
    //   mention_everyone: false,
    //   mentions: [], // TODO: parse out mentions
    //   mention_roles: [],
    //   attachments: [],
    //   embeds: [], // TODO: add embeds for files?
    //   reactions: [], // TODO: reactions?
    //   nonce: null, // TODO: how does this work..?
    //   pinned: false,
    //   webhook_id: null,
    //   type: 0,
    //   activity: null,
    //   application: null
    // };
  }

  dispatch(type, body) {
    console.log(`Dispatching new ${type} event!`);
    this.send("dispatch", body, {
      s: this.sequence++,
      t: type
    });
  }

  _jsonGuild(guild) {
    return {
      id: guild.id,
      name: guild.nick,
      icon: null,
      splash: null,
      owner: false,
      owner_id: 1,
      permissions: 285696, // https://btw-i-use.elixi.re/i/hb9.png
      region: "brazil",
      afk_channel_id: null,
      embed_enabled: false,
      embed_channel_id: null, // The widget thing
      verification_level: 1, // TODO: Add actual checking for +R presence
      default_message_notifications: 1,
      explicit_content_filter: 0,
      roles: [
        {
          id: guild.id,
          name: "@everyone",
          color: 0,
          hoist: false,
          position: 0,
          permissions: 285696,
          managed: false,
          mentionable: false
        }
      ],
      emojis: [],
      features: [],
      mfa_level: 0,
      application_id: null,
      widget_enabled: false,
      widget_channel_id: null,
      system_channel_id: null,
      joined_at: utils.getTime(),
      large: false,
      unavailable: false,
      member_count: Object.keys(this.master.members[guild.id]).length,
      voice_states: [],
      members: Object.keys(this.master.members[guild.id]).map(userId =>
        utils.toMember(this.master.users[userId])
      ),
      channels: [
        {
          id: guild.id,
          type: 0,
          guild_id: guild.id,
          position: 0,
          permission_overwrites: [],
          name: guild.nick,
          topic: guild.topic,
          nsfw: false,
          last_message_id: null,
          parent_id: null,
          last_pin_timestamp: null
        }
      ],
      presences: Object.keys(this.master.members[guild.id]).map(userId => {
        const user = this.master.users[userId];
        return {
          user: user.toJSON(),
          roles: [],
          game: null,
          guild_id: guild.id,
          status: this.master.members[guild.id][userId] ? "online" : "offline"
        };
      })
    };
  }

  _sendPresence(user, guild, status) {
    return this.dispatch("PRESENCE_UPDATE", {
      user: user.toJSON(),
      roles: [],
      game: null,
      guild_id: guild.id,
      status: status
    });
  }

  async _identify(data) {
    console.log(data);
    try {
      this.user = await utils.findToken(data.d.token);
    } catch (err) {
      console.log(err);
      return this.ws.close(4004);
    }
    this.connection = await this.master.getConnection(this.user.id);

    this._hookConnection(this.connection);
    return this.dispatch("READY", {
      v: 6,
      user: this.user.toJSON(),
      private_channels: [],
      tutorial: null,
      guilds: Object.keys(this.master.members)
        .filter(
          guildId => this.master.members[guildId][this.user.id] !== undefined
        )
        .map(guildId => this._jsonGuild(this.master.guilds[guildId])),
      session_id: this._createSessionId(),
      relationships: [],
      read_state: [],
      presences: [],
      notes: {},
      friend_suggestion_count: 0,
      experiments: [],
      connected_accounts: [],
      user_guild_settings: [],
      user_settings: {
        afk_timeout: 300,
        animate_emoji: true,
        convert_emoticons: false,
        default_guilds_restricted: true,
        detect_platform_accounts: false,
        developer_mode: true,
        enable_tts_command: false,
        explicit_content_filter: 2,
        friend_source_flags: { mutual_friends: true },
        gif_auto_play: true,
        guild_positions: [],
        inline_attachment_media: true,
        inline_embed_media: true,
        locale: "en-US",
        message_display_compact: false,
        render_embeds: true,
        render_reactions: true,
        restricted_guilds: [],
        show_current_game: true,
        status: "online",
        theme: "dark",
        timezone_offset: 420
      },
      analytics_token: "penis",
      _trace: ["fuck"]
    });
    // return this.dispatch("READY", {
    //   v: 6,
    //   user: this.user.toJSON(),
    //   guilds: [
    //     // this._jsonGuild({
    //     //   id: "42042042042042069",
    //     //   nick: "test"
    //     // })
    //   ],
    //   session_id: this._createSessionId(),
    //   _trace: ["eyers"]
    // });
  }

  _createSessionId() {
    return crypto
      .createHash("md5")
      .update(Math.random().toString())
      .digest("hex");
  }

  _ackHeartbeat() {
    this.send("heartbeatAck");
  }

  _hello() {
    return this.send("hello", {
      heartbeat_interval: 45000,
      _trace: ["hewwo"]
    });
  }

  _onMessage(message) {
    const packet =
      message instanceof ArrayBuffer
        ? erlpack.unpack(new Buffer(message))
        : JSON.parse(message);

    console.log(`<- ${JSON.stringify(packet)}`);
    this.handlers[OPLOOKUP[packet.op]].apply(this, [packet]);
  }

  send(opcode, data, merge = {}) {
    const response = {
      op: OPS[opcode],
      d: data || undefined,
      ...merge
    };
    const packet = JSON.stringify(response);
    console.log(`-> ${packet}`);
    return this.ws.send(packet);
  }
}

module.exports = {
  Master
};
