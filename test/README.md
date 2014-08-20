Testing vigour-fs on devices
===

## Requirements
- browserify
    + `npm install -g browserify`
- [cordova](http://cordova.apache.org/)

## Running the tests
- Navigate to the client test directory
    + `cd client`
- Create new cordova project
    + `cordova create native io.vigour.vigourFsNativeTest VigourFsNativeTest`
- Go into the created directory
    + `cd native`
- Add the file plugin
    + `cordova plugin add org.apache.cordova.file`
- Install the desired platforms
    + `cordova platform add <platform_name>`
        * Use `cordova platform list` to get a list of available platforms
- Replace default index.html
    + `cp ../index.html www/`
- Bundle the test script
    + `browserify ../index.js > www/js/index.js`
- Start test servers
    + `node ../startServers.js`
- Plug in a device
- Make sure USB debugging is enabled
- Launch the test on that device
    + `cordova run <platform_name> --device`