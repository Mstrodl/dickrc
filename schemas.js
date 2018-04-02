const mongoose = require("mongoose");
const config = require("./config");

const guildSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true
  },
  nick: {
    type: String,
    required: true,
    unique: true
  }
});

const userSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      unique: true
    },
    nick: {
      type: String,
      required: true,
      unique: true
    },
    hash: {
      type: String,
      required: true,
      unique: true
    }
  },
  {
    toJSON: {
      transform: function(doc, ret) {
        console.log("what the fuck");
        return {
          id: doc.id,
          username: doc.nick,
          discriminator: "0001",
          avatar: null,
          bot: false,
          mfa_enabled: true,
          verified: true, // TODO: check if user is on nickserv somehow?
          email: `${doc.nick}@${config.ircHost}`
        };
      }
    },
    toMember: {
      transform: function(doc, ret) {
        ret = {
          user: doc.toJSON(),
          nick: doc.nick,
          roles: [],
          joined_at: new Date().toISOString(),
          deaf: false,
          muted: false
        };
      }
    }
  }
);

module.exports = {
  User: mongoose.model("user", userSchema),
  Guild: mongoose.model("guild", guildSchema)
};
