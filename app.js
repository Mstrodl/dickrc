var express = require("express");
var path = require("path");
var logger = require("morgan");
var bodyParser = require("body-parser");
const mongoose = require("mongoose");

mongoose.Promise = global.Promise;
mongoose.connect("localhost", "dickrc");
const discordShimSetup = require("./routes/discordshim.js");
const { Master } = require("./ConnectionMaster.js");
const master = new Master();

let cors = require("cors");
var app = express();
app.use(
  cors({
    allowedHeaders: ["Authorization", "Content-Type"],
    origin: (origin, cb) => cb(null, true)
  })
);

app.use(logger("dev"));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.text());

const shim = discordShimSetup(master);
app.use("/api/v7", shim);
app.use("/api/v6", shim);
app.use("/api", shim);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  var err = new Error("Not Found");
  err.status = 404;
  next(err);
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get("env") === "development" ? err : {};

  // render the error page
  res.status(err.status || 500);
  console.log(err);
  res.json(err.message);
});

module.exports = app;

process.on("unhandledRejection", err => console.log(err));
