function setup(master) {
  const router = require("express").Router();
  const config = require("../config.js");
  const utils = require("../utilities.js");

  router.use(function(err, req, res, next) {
    if (err.extra.code && err.extra.status) {
      return res.status(err.extra.status).json({
        code: err.extra.code,
        message: `${err.extra.status}: ${err.message}`
      });
    }
  });

  router.get("/gateway", function(req, res) {
    return res.json({
      url: `ws${config.https ? "s" : ""}://${config.host ||
        "localhost"}:${config.wsport || "8000"}`
    });
  });

  router.get("/gateway/bot", function(req, res) {
    return res.json({
      url: `ws${config.https ? "s" : ""}://${config.host ||
        "localhost"}:${config.wsDisplayPort ||
        config.wsport ||
        "8000"}${config.wsEndpoint || ""}`,
      shards: 1
    });
  });

  router.get("/channels/:channel_id/messages", authenticateUser, async function(
    req,
    res
  ) {
    // TODO: store messages?
    return res.json([]);
  });

  router.get("/users/@me", authenticateUser, async function(req, res) {
    return res.json(req.user.toJSON());
  });

  router.get("/channels/:channel_id/typing", authenticateUser, async function(
    req,
    res
  ) {
    return res.status(204).send("");
  });

  router.patch(
    "/channels/:channel_id/messages/:message_id",
    authenticateUser,
    async function(req, res) {
      const connection = await master.getConnection(req.user.id);
      // TODO: support multipart & embeds
      console.log("got a connection, and authed");
      try {
        var guild = await master.getGuild(req.params.channel_id.toString());
      } catch (err) {
        throw new utils.UnknownChannel();
      }
      await connection.send(guild, req.body.content + "(edited)");
      res.json(
        await utils.createMessage({
          content: req.body.content,
          id: req.params.message_id,
          user: req.user,
          guild: guild,
          edited: true
        })
      );
    }
  );

  router.put(
    "/channels/:channel_id/messages/:message_id/reactions/:emoji/@me",
    authenticateUser,
    async function(req, res) {
      const connection = await master.getConnection(req.user.id);
      // TODO: support multipart & embeds
      console.log("got a connection, and authed");
      try {
        var guild = await master.getGuild(req.params.channel_id.toString());
      } catch (err) {
        throw new utils.UnknownChannel();
      }
      await connection.send(guild, `(Reaction: ${req.params.emoji})`);
      res.status(204).send("");
    }
  );

  router.post(
    "/channels/:channel_id/messages",
    authenticateUser,
    async function(req, res) {
      console.log(req.user);
      const connection = await master.getConnection(req.user.id);
      // TODO: support multipart & embeds
      console.log("got a connection, and authed");
      try {
        var guild = await master.getGuild(req.params.channel_id.toString());
      } catch (err) {
        throw new utils.UnknownChannel();
      }
      console.log("sending...");
      console.log(connection);
      await connection.send(guild, req.body.content);
      console.log("FUCK");
      res.json(
        await utils.createMessage({
          guild,
          user: req.user,
          content: req.body.content
        })
      );
    }
  );

  async function authenticateUser(req, res, next) {
    req.user = await utils.findToken(
      req.headers.authorization.split(" ").pop()
    );
    console.log("uwu found a token");
    next();
  }
  return router;
}

module.exports = setup;
