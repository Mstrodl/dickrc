const { User } = require("./schemas.js");
const mongoose = require("mongoose");
const utils = require("./utilities.js");
mongoose.connect("localhost", "dickrc");

(async () => {
  try {
    await new User({
      id: await utils.generateSnowflake(),
      nick: process.argv[2],
      hash: await utils.createHash(),
      password: process.argv[3]
    }).save();
  } catch (err) {
    console.log("lmaole", err);
  }
  mongoose.disconnect();
})();
