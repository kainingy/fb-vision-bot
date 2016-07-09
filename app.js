/*
 * Copyright 2016-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

/* jshint node: true, devel: true */
'use strict';

const
  bodyParser = require('body-parser'),
  config = require('config'),
  crypto = require('crypto'),
  express = require('express'),
  https = require('https'),
  request = require('request'),
  fs = require('fs');

var gcloud = require('gcloud')({
  keyFilename: 'fb-vision-bot-credentials.json',
  projectId: 'ornate-antler-135023'
});

var vision = gcloud.vision();

console.log(vision);

var app = express();

app.set('port', process.env.PORT || 8080);
app.use(bodyParser.json({ verify: verifyRequestSignature }));
app.use(express.static('public'));


/*
 * Be sure to setup your config values before running this code. You can
 * set them using environment variables or modifying the config file in /config.
 *
 */

// App Secret can be retrieved from the App Dashboard
const APP_SECRET =
  (process.env.MESSENGER_APP_SECRET) ?
  process.env.MESSENGER_APP_SECRET :
  config.get('appSecret');

// Arbitrary value used to validate a webhook
const VALIDATION_TOKEN =
  (process.env.MESSENGER_VALIDATION_TOKEN) ?
  (process.env.MESSENGER_VALIDATION_TOKEN) :
  config.get('validationToken');

// Generate a page access token for your page from the App Dashboard
const PAGE_ACCESS_TOKEN =
  (process.env.MESSENGER_PAGE_ACCESS_TOKEN) ?
  (process.env.MESSENGER_PAGE_ACCESS_TOKEN) :
  config.get('pageAccessToken');

if (!(APP_SECRET && VALIDATION_TOKEN && PAGE_ACCESS_TOKEN)) {
  console.error("Missing config values");
  process.exit(1);
}

// var download = function(uri, filename, callback){
//   request.head(uri, function(err, res, body){
//     console.log('content-type:', res.headers['content-type']);
//     console.log('content-length:', res.headers['content-length']);

//     request(uri).pipe(fs.createWriteStream(filename)).on('close', callback);
//   });
// };
var download = function(uri, filename, callback){
  request.head(uri, function(err, res, body){
    if (err) callback(err, filename);
    else {
      console.log('content-type:', res.headers['content-type']);
      console.log('content-length:', res.headers['content-length']);
      var stream = request(uri);
      stream.pipe(
        fs.createWriteStream(filename)
          .on('error', function(err){
            callback(error, filename);
            stream.read();
          })
        )
      .on('close', function() {
        callback(null, filename);
      });
    }
  });
};

/*
 * Use your own validation token. Check that the token used in the Webhook
 * setup is the same token used here.
 *
 */
app.get('/webhook', function(req, res) {
  if (req.query['hub.mode'] === 'subscribe' &&
      req.query['hub.verify_token'] === VALIDATION_TOKEN) {
    console.log("Validating webhook");
    res.status(200).send(req.query['hub.challenge']);
  } else {
    console.error("Failed validation. Make sure the validation tokens match.");
    res.sendStatus(403);
  }
});

/*
 * All callbacks for Messenger are POST-ed. They will be sent to the same
 * webhook. Be sure to subscribe your app to your page to receive callbacks
 * for your page.
 * https://developers.facebook.com/docs/messenger-platform/implementation#subscribe_app_pages
 *
 */
app.post('/webhook', function (req, res) {
  var data = req.body;
  // Make sure this is a page subscription
  if (data.object == 'page') {
    console.log(data.entry);
    // Iterate over each entry
    // There may be multiple if batched
    data.entry.forEach(function(pageEntry) {
      var pageID = pageEntry.id;
      var timeOfEvent = pageEntry.time;

      // Iterate over each messaging event
      pageEntry.messaging.forEach(function(messagingEvent) {
        if (messagingEvent.optin) {
          receivedAuthentication(messagingEvent);
        } else if (messagingEvent.message) {
          receivedMessage(messagingEvent);
        } else if (messagingEvent.delivery) {
          receivedDeliveryConfirmation(messagingEvent);
        } else if (messagingEvent.postback) {
          receivedPostback(messagingEvent);
        } else {
          console.log("Webhook received unknown messagingEvent: ", messagingEvent);
        }
      });
    });

    // Assume all went well.
    //
    // You must send back a 200, within 20 seconds, to let us know you've
    // successfully received the callback. Otherwise, the request will time out.
    res.sendStatus(200);
  }
});

/*
 * Verify that the callback came from Facebook. Using the App Secret from
 * the App Dashboard, we can verify the signature that is sent with each
 * callback in the x-hub-signature field, located in the header.
 *
 * https://developers.facebook.com/docs/graph-api/webhooks#setup
 *
 */
function verifyRequestSignature(req, res, buf) {
  var signature = req.headers["x-hub-signature"];

  if (!signature) {
    // For testing, let's log an error. In production, you should throw an
    // error.
    console.error("Couldn't validate the signature.");
  } else {
    var elements = signature.split('=');
    var method = elements[0];
    var signatureHash = elements[1];

    var expectedHash = crypto.createHmac('sha1', APP_SECRET)
                        .update(buf)
                        .digest('hex');

    if (signatureHash != expectedHash) {
      throw new Error("Couldn't validate the request signature.");
    }
  }
}

/*
 * Authorization Event
 *
 * The value for 'optin.ref' is defined in the entry point. For the "Send to
 * Messenger" plugin, it is the 'data-ref' field. Read more at
 * https://developers.facebook.com/docs/messenger-platform/webhook-reference#auth
 *
 */
function receivedAuthentication(event) {
  var senderID = event.sender.id;
  var recipientID = event.recipient.id;
  var timeOfAuth = event.timestamp;

  // The 'ref' field is set in the 'Send to Messenger' plugin, in the 'data-ref'
  // The developer can set this to an arbitrary value to associate the
  // authentication callback with the 'Send to Messenger' click event. This is
  // a way to do account linking when the user clicks the 'Send to Messenger'
  // plugin.
  var passThroughParam = event.optin.ref;

  console.log("Received authentication for user %d and page %d with pass " +
    "through param '%s' at %d", senderID, recipientID, passThroughParam,
    timeOfAuth);

  // When an authentication is received, we'll send a message back to the sender
  // to let them know it was successful.
  sendTextMessage(senderID, "Authorizationentication successful");
}

/*
 * Message Event
 *
 * This event is called when a message is sent to your page. The 'message'
 * object format can vary depending on the kind of message that was received.
 * Read more at https://developers.facebook.com/docs/messenger-platform/webhook-reference#received_message
 *
 * For this example, we're going to echo any text that we get. If we get some
 * special keywords ('button', 'generic', 'receipt'), then we'll send back
 * examples of those bubbles to illustrate the special message bubbles we've
 * created. If we receive a message with an attachment (image, video, audio),
 * then we'll simply confirm that we've received the attachment.
 *
 */
function receivedMessage(event) {
  var senderID = event.sender.id;
  var recipientID = event.recipient.id;
  var timeOfMessage = event.timestamp;
  var message = event.message;

  console.log("Received message for user %d and page %d at %d with message:",
    senderID, recipientID, timeOfMessage);
  console.log(JSON.stringify(message));

  var messageId = message.mid;

  // You may get a text or attachment but not both
  var messageText = message.text;
  var messageAttachments = message.attachments;

  if (messageText) {

    // If we receive a text message, check to see if it matches any special
    // keywords and send back the corresponding example. Otherwise, just echo
    // the text we received.
    switch (messageText) {
      // case 'image':
      //   sendImageMessage(senderID);
      //   break;

      // case 'button':
      //   sendButtonMessage(senderID);
      //   break;

      // case 'generic':
      //   sendGenericMessage(senderID);
      //   break;

      // case 'receipt':
      //   sendReceiptMessage(senderID);
      //   break;

      default:
        sendTextMessage(senderID, "Please type 'Help' or open the menu.");
    }
  } else if (messageAttachments) {
    messageAttachments.forEach(function(messageAttachment) {
      var attachmentUrl = messageAttachment.payload.url;
      // console.log(messageAttachments);
      // @TODO1: Check if image / audio / video / file and save accordingly (messageAttachment.type)
      switch (messageAttachment.type) {

      }

      // @TODO2: Create random name respective to attachment type and save it in downloads
      download(attachmentUrl, 'downloads/google.png', function(){ console.log('Failed to download ' + attachmentUrl); });
      sendAttachmentMessage(senderID, messageAttachment);
    });
    // sendTextMessage(senderID, "Message with attachment received");
  }
}


/*
 * Delivery Confirmation Event
 *
 * This event is sent to confirm the delivery of a message. Read more about
 * these fields at https://developers.facebook.com/docs/messenger-platform/webhook-reference#message_delivery
 *
 */
function receivedDeliveryConfirmation(event) {
  var senderID = event.sender.id;
  var recipientID = event.recipient.id;
  var delivery = event.delivery;
  var messageIDs = delivery.mids;
  var watermark = delivery.watermark;
  var sequenceNumber = delivery.seq;

  if (messageIDs) {
    messageIDs.forEach(function(messageID) {
      console.log("Received delivery confirmation for message ID: %s",
        messageID);
    });
  }

  console.log("All message before %d were delivered.", watermark);
}


/*
 * Postback Event
 *
 * This event is called when a postback is tapped on a Structured Message. Read
 * more at https://developers.facebook.com/docs/messenger-platform/webhook-reference#postback
 *
 */
function receivedPostback(event) {
  var senderID = event.sender.id;
  var recipientID = event.recipient.id;
  var timeOfPostback = event.timestamp;

  // The 'payload' param is a developer-defined field which is set in a postback
  // button for Structured Messages.
  var payload = event.postback.payload;

  console.log("Received postback for user %d and page %d with payload '%s' " +
    "at %d", senderID, recipientID, payload, timeOfPostback);

  var writeSession = (mode) => {
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

  switch (payload) {
    case 'PERSISTENT_MENU_HELP':
      sendMenuHelpMessage(senderID, "Set a mode chosen from the menu. ");
      break;

    // Create file that holds user data (later replace with database)
    case 'PERSISTENT_MENU_FACE_DETECTION':
      sendTextMessage(senderID, "Face Detection mode is set. Please send us an image.");
      writeSession('Face Detection')
      break;

    case 'PERSISTENT_MENU_OBJECT_DETECTION':
      sendTextMessage(senderID, "Object Detection mode is set. Please send us an image.");
      writeSession('Object Detection')
      break;

    case 'PERSISTENT_MENU_LANDMARK_DETECTION':
      sendTextMessage(senderID, "Landamrk Detection mode is set. Please send us an image.");
      writeSession('Landamrk Detection')
      break;

    case 'PERSISTENT_MENU_LOGO_DETECTION':
      sendTextMessage(senderID, "Logo Detection mode is set. Please send us an image.");
      writeSession('Logo Detection')
      break;

    case 'PERSISTENT_MENU_TEXT_DETECTION':
      sendTextMessage(senderID, "Text Detection mode is set. Please send us an image.");
      writeSession('Text Detection')
      break;

    case 'PERSISTENT_MENU_FILTER_SAFE_SEARCH':
      sendTextMessage(senderID, "Filter Safe Search mode is set. Please send us an image.");
      writeSession('Filter Safe Search')
      break;

    case 'PERSISTENT_MENU_IMAGE_PROPERTIES':
      sendTextMessage(senderID, "Image Properties mode is set. Please send us an image.");
      writeSession('Image Properties')
      break;

    case 'PERSISTENT_MENU_OTHERS':
      sendMenuOthersMessage(senderID, "You can also try out the following modes: 'Text Detection', 'Filter Safe Search', and 'Image Properties'.");
      break;

    default:
      // When a postback is called, we'll send a message back to the sender to
      // let them know it was successful
      console.log("Postback called");
      sendTextMessage(senderID, "Please type 'Help' or open the menu.");
      break;
  }
}

// /*
//  * Send a button message using the Send API.
//  *
//  */
// function sendMenuHelpMessage(recipientId, messageText) {

//   var buttons1 = [{
//     type: "postback",
//     title: "Face Detection",
//     payload: "PERSISTENT_MENU_FACE_DETECTION"
//   },{
//     type: "postback",
//     title: "Object Detection",
//     payload: "PERSISTENT_MENU_OBJECT_DETECTION"
//   },{
//     type: "postback",
//     title: "Landamrk Detection",
//     payload: "PERSISTENT_MENU_LANDMARK_DETECTION"
//   }]
//   var buttons2 = [{
//     type: "postback",
//     title: "Logo Detection",
//     payload: "PERSISTENT_MENU_LOGO_DETECTION"
//   },{
//     type: "postback",
//     title: "Text Detection",
//     payload: "PERSISTENT_MENU_TEXT_DETECTION"
//   },{
//     type: "postback",
//     title: "Filter Safe Search",
//     payload: "PERSISTENT_MENU_FILTER_SAFE_SEARCH"
//   }]
//   var buttons3 = [{
//     type: "postback",
//     title: "Image Properties Detection",
//     payload: "PERSISTENT_MENU_IMAGE_PROPERTIES"
//   }]

//   sendButtonMessage(recipientId, messageText, buttons1, false);
//   setTimeout(function() {
//     sendButtonMessage(recipientId, messageText, buttons2, true);
//     setTimeout(function() {
//       sendButtonMessage(recipientId, messageText, buttons3, true);
//     }, 100);
//   }, 100);
// }

/*
 * Send a button message using the Send API.
 *
 */
function sendMenuOthersMessage(recipientId, messageText) {
  var buttons = [{
    type: "postback",
    title: "Text Detection",
    payload: "PERSISTENT_MENU_TEXT_DETECTION"
  },{
    type: "postback",
    title: "Filter Safe Search",
    payload: "PERSISTENT_MENU_FILTER_SAFE_SEARCH"
  },{
    type: "postback",
    title: "Image Properties",
    payload: "PERSISTENT_MENU_IMAGE_PROPERTIES"
  }];

  sendButtonMessage(recipientId, messageText, buttons, false);
}

/*
 * Send a message with an using the Send API.
 *
 */
function sendAttachmentMessage(recipientId, messageAttachment) {
  var baseUrl = "http://40eab60e.ngrok.io/sessions/";
  var url = baseUrl + recipientId + ".";
  var messageDataTemplate = {
    recipient: {
      id: recipientId
    },
    message: {
      attachment: {
        type: "image",
        payload: {
          url: url
        }
      }
    }
  };

  callSendAPI(messageDataTemplate);
}

// /*
//  * Send a message with an using the Send API.
//  *
//  */
// function sendImageMessage(recipientId) {
//   var messageData = {
//     recipient: {
//       id: recipientId
//     },
//     message: {
//       attachment: {
//         type: "image",
//         payload: {
//           url: "http://i.imgur.com/zYIlgBl.png"
//         }
//       }
//     }
//   };

//   callSendAPI(messageData);
// }

/*
 * Send a text message using the Send API.
 *
 */
function sendTextMessage(recipientId, messageText) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      text: messageText
    }
  };

  callSendAPI(messageData);
}

/*
 * Send a button message using the Send API.
 * Maximum limit of buttons is 3.
 *
 */
function sendButtonMessage(recipientId, messageText, buttons) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "button",
          text: messageText,
          buttons: buttons
          // [{
          //   type: "web_url",
          //   url: "https://www.oculus.com/en-us/rift/",
          //   title: "Open Web URL"
          // }, {
          //   type: "postback",
          //   title: "Call Postback",
          //   payload: "Developer defined postback"
          // }]
        }
      }
    }
  };

  callSendAPI(messageData);
}

// /*
//  * Send a Structured Message (Generic Message type) using the Send API.
//  *
//  */
// function sendGenericMessage(recipientId) {
//   var messageData = {
//     recipient: {
//       id: recipientId
//     },
//     message: {
//       attachment: {
//         type: "template",
//         payload: {
//           template_type: "generic",
//           elements: [{
//             title: "rift",
//             subtitle: "Next-generation virtual reality",
//             item_url: "https://www.oculus.com/en-us/rift/",
//             image_url: "http://messengerdemo.parseapp.com/img/rift.png",
//             buttons: [{
//               type: "web_url",
//               url: "https://www.oculus.com/en-us/rift/",
//               title: "Open Web URL"
//             }, {
//               type: "postback",
//               title: "Call Postback",
//               payload: "Payload for first bubble",
//             }],
//           }, {
//             title: "touch",
//             subtitle: "Your Hands, Now in VR",
//             item_url: "https://www.oculus.com/en-us/touch/",
//             image_url: "http://messengerdemo.parseapp.com/img/touch.png",
//             buttons: [{
//               type: "web_url",
//               url: "https://www.oculus.com/en-us/touch/",
//               title: "Open Web URL"
//             }, {
//               type: "postback",
//               title: "Call Postback",
//               payload: "Payload for second bubble",
//             }]
//           }]
//         }
//       }
//     }
//   };

//   callSendAPI(messageData);
// }

// /*
//  * Send a receipt message using the Send API.
//  *
//  */
// function sendReceiptMessage(recipientId) {
//   // Generate a random receipt ID as the API requires a unique ID
//   var receiptId = "order" + Math.floor(Math.random()*1000);

//   var messageData = {
//     recipient: {
//       id: recipientId
//     },
//     message:{
//       attachment: {
//         type: "template",
//         payload: {
//           template_type: "receipt",
//           recipient_name: "Peter Chang",
//           order_number: receiptId,
//           currency: "USD",
//           payment_method: "Visa 1234",
//           timestamp: "1428444852",
//           elements: [{
//             title: "Oculus Rift",
//             subtitle: "Includes: headset, sensor, remote",
//             quantity: 1,
//             price: 599.00,
//             currency: "USD",
//             image_url: "http://messengerdemo.parseapp.com/img/riftsq.png"
//           }, {
//             title: "Samsung Gear VR",
//             subtitle: "Frost White",
//             quantity: 1,
//             price: 99.99,
//             currency: "USD",
//             image_url: "http://messengerdemo.parseapp.com/img/gearvrsq.png"
//           }],
//           address: {
//             street_1: "1 Hacker Way",
//             street_2: "",
//             city: "Menlo Park",
//             postal_code: "94025",
//             state: "CA",
//             country: "US"
//           },
//           summary: {
//             subtotal: 698.99,
//             shipping_cost: 20.00,
//             total_tax: 57.67,
//             total_cost: 626.66
//           },
//           adjustments: [{
//             name: "New Customer Discount",
//             amount: -50
//           }, {
//             name: "$100 Off Coupon",
//             amount: -100
//           }]
//         }
//       }
//     }
//   };

//   callSendAPI(messageData);
// }

/*
 * Call the Send API. The message data goes in the body. If successful, we'll
 * get the message id in a response
 *
 */
function callSendAPI(messageData) {
  request({
    uri: 'https://graph.facebook.com/v2.6/me/messages',
    qs: { access_token: PAGE_ACCESS_TOKEN },
    method: 'POST',
    json: messageData

  }, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      var recipientId = body.recipient_id;
      var messageId = body.message_id;

      console.log("Successfully sent generic message with id %s to recipient %s",
        messageId, recipientId);
    } else {
      console.error("Unable to send message.");
      // console.error(response);
      console.error(error);
    }
  });
}

// Start server
// Webhooks must be available via SSL with a certificate signed by a valid
// certificate authority.
app.listen(app.get('port'), function() {
  console.log('Node app is running on port', app.get('port'));
});

module.exports = app;
