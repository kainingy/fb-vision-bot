# fb-vision-bot
Facebook Messenger Bot that consumes Google Cloud Vision API and provides insights on images.

This bot integrates a NLP platform Wit.ai with Facebook Messenger to provide a richer and smarter user experience.

Features of Google Cloud Vision API are the following:

- Label Detection
  - Detects broad sets of categories within an image, ranging from modes of transportation to animals.
- Explicit Content Detection
  - Detect explicit content like adult content or violent content within an image.
- Logo Detection
  - Detect popular product logos within an image.
- Landmark Detection
  - Detect popular natural and man-made structures within an image.
- Optical Character Recognition
  - Detect and extract text within an image, with support for a broad range of languages, along with support for automatic language identification.
- Face Detection
  - Detect multiple faces within an image, along with the associated key facial attributes like emotional state or wearing headwear. Facial Recognition is not supported.
- Image Attributes
  - Detect general attributes of the image, such as dominant color.

First check out the [Quickstart Guide](https://developers.facebook.com/docs/messenger-platform/quickstart) provided by Facebook.

Second, mkdir config and add a default.json inside config with the following contents:

```javascript
{
  "appSecret": "YOURAPPSECRET",
  "pageAccessToken": "YOURPAGEACCESSTOKEN",
  "validationToken": "YOURVALIDATIONTOKEN"<
}
```


## Running Locally
0. Install Node and NPM and ngrok (or localtunnel)
1. Run "sudo npm install" command to install external modules locally
2. Run "node app.js" to run the app
3. Enter localhost:8080 on the web url to check (All static files are served in the 'public' folder)
4. Enter ngrok http 8080 to tunnel a connection from https://foo.ngrok.io to localhost
5. Give https://foo.ngrok.io/webhook for your webhook verificaiton URL in the Messenger App settings
6. Now for every message, you can check the response and request through your console.

## Running on Heroku
0. Do steps 0~1 from above and install Heroku toolbelt from the Heroku website
1. Run "heroku login"
2. If existing repository, simply add a remote to heroku with this command: heroku git:remote -a YOUR_HEROKU_APP
3. Else, run the following codes

  - heroku git:clone -a image-bot-test && cd image-bot-test
  - git add . && git commit -am "make it better" && git push heroku master

4. Give https://yourheroku.herokuapp.com/webhook for your webhook verificaiton URL in the Messenger App settings
5. Voila :)
