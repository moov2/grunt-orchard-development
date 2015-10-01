/*
 * Downloads specified version of the source code for Orchard.
 */

var fs = require('fs');
var path = require('path');
var async = require('async');
var request = require('request');
var _ = require('lodash');
var mv = require('mv');
var JSZip = require('jszip');

'use strict';

module.exports = function(grunt) {

    /**
     * Collection of URLs to Orchard source code downloads.
     */
    var orchardDownloads = [
        { version: '1.9.1', url: 'https://github.com/OrchardCMS/Orchard/archive/1.9.1.zip' },
        { version: '1.9', url: 'https://github.com/OrchardCMS/Orchard/archive/1.9.zip' },
        { version: '1.8.2', url: 'https://github.com/OrchardCMS/Orchard/archive/1.8.2.zip' },
        { version: '1.8.1', url: 'https://github.com/OrchardCMS/Orchard/archive/1.8.1.zip' },
        { version: '1.7.1', url: 'https://github.com/OrchardCMS/Orchard/archive/1.7.1.zip' }
    ];

    var helpers = {
        /**
         * Downloads single file to local computer.
         */
        curl: function (info, cb) {
            // Default to a binary request
            var options = info.src;
            var dest = info.dest;

            // Request the url
            var req = request(options);

            // On error, callback
            req.on('error', cb);

            // On response, callback for writing out the stream
            req.on('response', function handleResponse (res) {
                // Assert the statusCode was good
                var statusCode = res.statusCode;
                if (statusCode < 200 || statusCode >= 300) {
                  return cb(new Error('Fetching ' + JSON.stringify(options) + ' failed with HTTP status code ' + statusCode));
                }

                // Otherwise, write out the content
                var destdir = path.dirname(dest);
                grunt.file.mkdir(destdir);
                var writeStream = fs.createWriteStream(dest);
                // Use `req` as the source of data https://github.com/request/request/blob/v2.51.1/request.js#L1255-L1267
                // DEV: This is to pipe out gunzipped data
                var dataStream = req;
                dataStream.pipe(writeStream);

                // When the stream errors or completes, exit
                writeStream.on('error', cb);
                writeStream.on('close', cb);
            });
        },

        /**
         * Returns directories inside the directory associated to the provided path.
         */
        getDirectories: function (srcpath) {
            return fs.readdirSync(srcpath).filter(function(file) {
                return fs.statSync(path.join(srcpath, file)).isDirectory();
            });
        },

        /**
         * Returns the download URL for Orchard source code.
         */
        getOrchardDownload: function (version) {
            return _.findWhere(orchardDownloads, { version: version });
        },

        /**
         * Writes data to a file, ensuring that the containing directory exists.
         */
        writeFile: function (url, content) {
            var dirName = path.dirname(url);

            if (!fs.existsSync(dirName)) {
                fs.mkdirSync(dirName);
            }

            fs.writeFileSync(url, content, {
                mode: 0777
            });
        }
    };

    grunt.registerTask('orchardDownload', 'Downloads Orchard source code.', function () {
        /**
         * Retrieves defined options.
         */
        var options = this.options();
        grunt.verbose.writeflags(options, 'Options');

        // directory where Orchard should be setup within.
        options.destination = './local';

        // Orchard download is extracted into this directory before being moved
        // to a directory related to the version number.
        options.tempDir = path.join(options.destination, 'temp');

        // File path where zip containing Orchard is saved.
        options.downloadDestination = path.join(options.destination, 'Orchard.Source.' + options.version + '.zip');

        // Path to the directory where Orchrd will be installed.
        options.localDir = path.join(options.destination, options.version);

        // grunt task should be marked as async.
        var done = this.async();

        /**
         * Deletes the downloaded zip & temporary directory.
         */
        var cleanUp = function (onComplete) {
            grunt.file.delete(options.tempDir, { force: true });

            fs.exists(options.downloadDestination, function (exists) {
                if (exists) {
                    fs.unlinkSync(options.downloadDestination);
                }

                if (onComplete) {
                    onComplete();
                }
            });
        };

        /**
         * Downloads a version of Orchard from the Internet.
         */
        var download = function (orchardDownload) {
            grunt.log.writeln('downloading Orchard ' + options.version + ', this may take a while...');

            helpers.curl({
                src: orchardDownload.url,
                dest: options.downloadDestination
            }, function handleCurlComplete (err) {
                // If there is an error, fail
                if (err) {
                    grunt.fail.warn(err);
                    return done();
                }

                grunt.log.writeln('download complete.');
                extractZip(orchardDownload);
            });
        };

        /**
         * Unzips the download that contains Orchard and sets up the extracted files
         * in a directory reflecting the version number.
         */
        var extractZip = function (orchardDownload) {
            var content, dest, zip;

            grunt.log.writeln('extracting downloaded zip...');

            fs.mkdirSync(options.tempDir);

            fs.readFile(options.downloadDestination, function (err, data) {
                if (err) {
                    throw err;
                }

                zip = new JSZip(data);

                Object.keys(zip.files).forEach(function(filename) {
                    content = zip.files[filename].asNodeBuffer();
                    dest = path.join(options.tempDir, filename);

                    if (filename.substr(filename.length - 1, 1) === '/') {
                        fs.mkdirSync(dest);
                    } else {
                        helpers.writeFile(dest, content);
                    }
                });

                grunt.log.writeln('extraction complete.');

                // introduce a slight delay to prevent a permission error when moving
                // the Orchard source code from a temp directory to a directory
                // tied to the version number.
                setTimeout(moveFiles, 200);
            });
        };

        /**
         * Moves extract files into directory that reflects the version number.
         */
        var moveFiles = function () {
            // ensures the uncompressed Orchard code is inside the version directory
            // inside directory that contains local Orchard install. This is to
            // ensure a directory structure like `/local/1.8.1/Orchard-1.8.1`
            // doesn't occur becuase the download zip contents is within it's
            // own directory.
            var contents = helpers.getDirectories(options.tempDir),
                currentDirName = (contents.length === 1) ? path.join(options.tempDir, contents[0]) : options.tempDir;

            mv(currentDirName, options.localDir, {mkdirp: true}, function() {
                cleanUp(done);
            });
        };

        /**
         * Kicks off the task of downloading Orchard (if not already downloaded).
         */
        var begin = function () {
            var orchardDownload = (options.url) ? { version: options.version, url: options.url } : helpers.getOrchardDownload(options.version);

            if (!orchardDownload) {
                grunt.fail.fatal('Unrecognised Orchard version number.');
                // TODO: Add information on how to setup custom version of Orchard.
            }

            // check if the Orchard version has already been setup.
            fs.exists(options.localDir, function (exists) {
                if (exists) {
                    done();
                    return;
                }

                // Orchard hasn't been setup yet, it must be downloaded first.
                download(orchardDownload);
            });
        };

        cleanUp(begin);
    });
};
