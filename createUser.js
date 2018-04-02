const { User } = require("./schemas.js");

new User({
  id: 69,
  nick: "beepy"
})
  .save()
  .then(r => console.log(r));
