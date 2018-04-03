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

function parseMarkdown(txt) {
  return txt
    .replace(/\*\*(.*)\*\*/g, (o, match) => "\x02" + match + "\x0F")
    .replace(/__(.*)__/g, (o, match) => "\x1F" + match + "\x0F")
    .replace(
      /\*(.*)\*|_(.*)_/g,
      (o, match1, match2) => "\x1D" + (match1 || match2) + "\x0F"
    )
    .replace(/~~(.*)~~/g, (o, match) => "\x0315,99" + match + "\x0F");
}

function addFields(rows, longest) {
  if (rows.length == 1) return `${rows[0].name}\n${rows[0].value}`;

  for (const rowNum in rows) {
    rows[rowNum] = {
      value: `**${rows[rowNum].name}**` + "\n" + (rows[rowNum].value || "")
    };
    rows[rowNum].value = parseMarkdown(rows[rowNum].value);
  }

  // const longest =
  //   rows[0].value.split("\n").sort((a, b) => b.length - a.length)[0].length + 3;
  const tallestRows = rows.sort((a, b) => b.length - a.length)[0];
  let outputs = "";
  const rowLines = rows.map(r => r.value.split("\n"));
  for (const rowNum in tallestRows.value.split("\n")) {
    outputs +=
      ircPad(rowLines[0][rowNum] || "", longest) +
      " | " +
      (rowLines[1][rowNum] || "") +
      "\n";
  }
  return outputs;
}

function ircPad(text, padding) {
  const length = text.replace(
    /[\x02\x1F\x0F\x16\x1D]|\x03(\d\d?(,\d\d?)?)?/g,
    ""
  ).length;
  return text + " ".repeat(padding - length);
}

function renderEmbed(embed = {}) {
  function a(tx) {
    if (!tx) return;
    text += tx + "\n";
  }
  let text = "";
  if (embed.title) a(embed.title + (embed.url ? `" (${embed.url})` : ""));
  a(embed.description);
  if (embed.fields && embed.fields.length) {
    const fields = embed.fields;
    const outputs = [];
    const longestValue = embed.fields.sort(
      (a, b) => b.value.length - a.value.length
    )[0].value.length;
    const longestName = embed.fields.sort(
      (a, b) => b.name.length - a.name.length
    )[0].name.length;
    const longest = longestName > longestValue ? longestName : longestValue;
    console.log("While the fields have a length!");
    while (fields.length) {
      // Oh god this is such shitcode.
      const field = fields.shift();
      console.log("rendering field", field);
      if (fields[0].inline && field.inline) {
        // If the next field is inline, we grab it
        field2 = fields.shift();
        outputs.push(addFields([field, field2], longest));
      } else {
        // If there's no inline fields in our group, we just add the one
        outputs.push(addFields([field], longest));
      }
    }
    a("\n" + outputs.join("\n"));
  }
  if (embed.thumbnail) {
    a(embed.thumbnail.url);
  }
  if (embed.image) {
    a(embed.image.url);
  }
  if (embed.author) {
    // Oh this is hell.
    a(
      `${
        embed.author.name
          ? `By ${embed.author.name}${
              embed.author.url ? ` ${embed.author.url} ` : ""
            }`
          : ""
      }${embed.author.icon_url ? " " + embed.author.icon_url : ""}`
    );
  }
  if (embed.footer && embed.footer.text) {
    a(
      embed.footer.text + embed.footer.icon_url
        ? " " + embed.footer.icon_url
        : ""
    );
  }
  console.log("rendered embed", text, "UwO");
  return text;
}

// Used to make every 100th character a newline so that the fields look decent
function shrink(text) {
  return text.replace("\n", " "); // TODO: Make a better fucking table system so this works properly.
  // return text.replace(/(.{100})/g, "$1\n");
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
  createHash,
  renderEmbed,
  parseMarkdown
};
