const Flake = require("flake-idgen");
const crypto = require("crypto");
const flake = new Flake();
const intformat = require("biguint-format");
const { User, Guild } = require("./schemas.js");
const nobi = require("nobi");

async function createToken(user) {
  const signer = nobi.timestampSigner(user.hash);
  const token = signer.sign(Buffer.from(user.id, "ascii").toString("base64"));
  return token;
}

function createHash() {
  return crypto
    .createHash("md5")
    .update(Math.random().toString())
    .digest("hex");
}

async function findToken(token) {
  console.log(token);
  const [base64UserId, timestamp, magic] = token.split(".");
  // TODO: Verify timestamp & magic against our data!
  const userId = Buffer.from(base64UserId, "base64").toString("ascii");
  const user = await User.findOne({
    id: userId
  });
  if (!user) {
    console.log("no user");
    throw new InvalidToken(
      "The token specified did not match any known users. Is it invalid?"
    );
  }
  const signer = nobi.timestampSigner(user.hash);
  try {
    signer.unsign(token, { maxAge: Number.MAX_SAFE_INTEGER });
  } catch (err) {
    throw new InvalidToken(
      "The token specified did not match any known users. Is it invalid?"
    );
  }

  console.log("returning");
  return user;
}

async function findUser(userId) {
  const user = await Users.findOne({
    user_id: userId
  });
  if (!user) {
    throw new UnknownUser("The user specified does not exist");
  }
  return user;
}

function toMember(user) {
  return {
    user: user.toJSON(),
    nick: user.nick,
    roles: [],
    joined_at: getTime(),
    deaf: false,
    mute: false
  };
}

async function createMessage({ guild, content, user, edited, id }) {
  return {
    nonce: await generateSnowflake(),
    attachments: [],
    tts: false,
    embeds: [],
    timestamp: getTime(),
    mention_everyone: false,
    id: id || (await generateSnowflake()),
    pinned: false,
    edited_timestamp: edited ? getTime() : null,
    author: user.toJSON(),
    mention_roles: [],
    content,
    channel_id: guild.id,
    mentions: [],
    type: 0
  };
}

function getTime() {
  return new Date().toISOString().replace("Z", "+00:00");
}

async function channelNick(chanenlId) {}

function generateSnowflake() {
  return new Promise((resolve, reject) => {
    return flake.next((err, id) => {
      if (err) {
        return reject(err);
      } else {
        // We call intformat on it because Nodejs is horrible with numbers
        return resolve(intformat(id, "dec"));
      }
    });
  });
}

// Errors
function InvalidToken(message, extra) {
  Error.captureStackTrace(this, this.constructor);
  this.name = this.constructor.name;
  this.message = message;
  this.extra = extra;
}

function UnknownChannel() {
  Error.captureStackTrace(this, this.constructor);
  this.name = this.constructor.name;
  this.message = "Unknown Channel";
  this.extra = { code: 10003, status: 404 };
}

function UnknownUser() {
  Error.captureStackTrace(this, this.constructor);
  this.name = this.constructor.name;
  this.message = "Unknown User";
  this.extra = { code: 10013, status: 404 };
}

module.exports = {
  UnknownUser,
  UnknownChannel,
  getTime,
  findUser,
  findToken,
  createToken,
  toMember,
  generateSnowflake,
  createMessage,
  createHash
};
