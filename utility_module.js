'use strict';

const
  bodyParser = require('body-parser'),
  config = require('config'),
  crypto = require('crypto'),
  express = require('express'),
  https = require('https'),
  request = require('request'),
  fs = require('fs');


module.exports = {

  download: function (uri, filename, callback) {
    request.head(uri, (err, res, body) => {
      if (err) callback(err, filename);
      else {
        console.log('content-type:', res.headers['content-type']);
        console.log('content-length:', res.headers['content-length']);
        var stream = request(uri);
        stream.pipe(
          fs.createWriteStream(filename)
            .on('error', function(err){
              callback(err, filename);
              stream.read();
            })
          )
        .on('close', function() {
          callback(null, filename);
        });
      }
    });
  },

  writeSession: function (mode, senderID) {
    var __writeSession = () => {
      fs.stat('sessions/'+senderID, (err, stats) => {
        if (err) {
          if (err.code == "ENOENT") {
            fs.mkdir('sessions/'+senderID, () => {
              fs.writeFile('sessions/'+senderID+'/'+senderID+'.txt', mode, 'utf8', (err) => {
                if (err) throw err;
                console.log('sessions/'+senderID+'.txt saved');
              });
            });
          }
          else throw err;
        }
        else {
          if (stats.isDirectory()){
            fs.writeFile('sessions/'+senderID+'/'+senderID+'.txt', mode, 'utf8', (err) => {
              if (err) throw err;
              console.log('sessions/'+senderID+'.txt saved');
            });
          }
        }
      });
    }

    fs.stat('sessions', (err,stats) => {
      if (err) {
        if (err.code == "ENOENT") {
          __writeSession(mode);
        }
        else throw err;
      }
      else {
        __writeSession(mode);
      }
    });
  }

};

