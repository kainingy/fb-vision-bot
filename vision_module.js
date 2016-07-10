'use strict';

const
  bodyParser = require('body-parser'),
  config = require('config'),
  crypto = require('crypto'),
  express = require('express'),
  https = require('https'),
  request = require('request'),
  fs = require('fs'),
  Canvas = require('canvas');

// Get Google Cloud Vision project ID to check the sender
const PROJECT_ID =
  (process.env.MESSENGER_PAGE_ACCESS_TOKEN) ?
  (process.env.MESSENGER_PAGE_ACCESS_TOKEN) :
  config.get('projectID');

var gcloud = require('gcloud')({
  keyFilename: 'fb-vision-bot-credentials.json',
  projectId: PROJECT_ID
});

var vision = gcloud.vision();

module.exports = {

  detectFaces: function (inputFile, callback) {
    // Make a call to the Vision API to detect the faces
    vision.detectFaces(inputFile, function (err, faces) {
      if (err) {
        return callback(err, faces);
      }
      var numFaces = faces.length;
      console.log('Found ' + numFaces + (numFaces === 1 ? ' face' : ' faces'));
      callback(null, faces);
    });
  },

  highlightFaces: function (inputFile, faces, outputFile, callback) {

    fs.readFile(inputFile, function (err, image) {
      if (err) {
        return callback(err);
      }

      var Image = Canvas.Image;
      // Open the original image into a canvas
      var img = new Image();
      img.src = image;
      var canvas = new Canvas(img.width, img.height);
      var context = canvas.getContext('2d');

      context.drawImage(img, 0, 0, img.width, img.height);

      // Now draw boxes around all the faces
      context.strokeStyle = 'rgba(0,255,0,0.8)';
      context.lineWidth = '5';

      faces.forEach(function (face) {
        context.beginPath();
        face.bounds.face.forEach(function (bounds) {
          context.lineTo(bounds.x, bounds.y);
        });
        context.lineTo(face.bounds.face[0].x, face.bounds.face[0].y);
        context.stroke();
      });

      // Write the result to a file
      canvas.toBuffer(function(err, buf){
        if (err) {
          return callback(err);
        }
        else {
          fs.writeFileSync(outputFile, buf);
          return callback(null);
        }
      });

    });
  }

};

