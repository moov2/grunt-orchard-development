/*
 * Executes the build process for Orchard themes.
 */

var fs = require('fs');
var path = require('path');
var async = require('async');
var mv = require('mv');

'use strict';

module.exports = function(grunt) {

    var helpers = {
        /**
         * Deletes a directory and everything inside.
         */
        deleteDirectory: function (path) {
            if (!fs.existsSync(path)) {
                return;
            }

            fs.readdirSync(path).forEach(function(file,index){
                var curPath = path + "/" + file;
                if(fs.lstatSync(curPath).isDirectory()) { // recurse
                    helpers.deleteDirectory(curPath);
                } else { // delete file
                    fs.unlinkSync(curPath);
                }
            });

            fs.rmdirSync(path);
        },

        /**
         * Returns directories inside the directory associated to the provided path.
         */
        getDirectories: function (srcpath) {
            return fs.readdirSync(srcpath).filter(function(file) {
                return fs.statSync(path.join(srcpath, file)).isDirectory();
            });
        }
    };

    grunt.registerTask('buildThemes', 'Builds custom themes.', function () {
        /**
         * Retrieves defined options.
         */
        var options = this.options();
        grunt.verbose.writeflags(options, 'Options');

        if (!options.dest) {
            grunt.fail.fatal('Unable to build themes if no `dest` option is provided.');
        }

        // check if /Themes has been included in destination path.
        if (options.dest.indexOf('/Themes') < 0) {
            options.dest = path.join(options.dest, 'Themes');
        }

        options.themes = options.themes || './themes';

        // grunt task should be marked as async.
        var done = this.async(),
            themes = helpers.getDirectories(options.themes),
            count = -1;

        /**
         * Builds the next theme (dictated by `count`) in the list of `themes`.
         */
        var buildNextTheme = function () {
            count++;

            // all themes have been built.
            if (count === themes.length) {
                // slight delay to ensure future tasks can interact with theme files.
                setTimeout(done, 500);
                return;
            }

            var child = grunt.util.spawn({
                cmd: 'npm',
                args: ['run', 'dist'],
                opts: {
                    cwd: path.join(options.themes, themes[count])
                }
            }, function(error, result, code) {
                if (error) {
                    grunt.fail.fatal('Failed to build theme ' + themes[count] + '.');
                    return;
                }
                
                helpers.deleteDirectory(path.join(options.dest, themes[count]));
                copyTheme();
            });

            child.stdout.on('data', function(buf) {
                grunt.log.writeln(String(buf));
            });

            child.stderr.on('data', function(buf) {
                grunt.log.writeln(String(buf));
            });
        };

        /**
         * Deletes the existing theme and copies the distributable ready theme
         * into position.
         */
        var copyTheme = function () {
            var dest = path.join(options.dest, themes[count]);

            // deletes theme is already exists.
            if (fs.exists(dest)) {
                fs.rmdir(dest);
            }

            mv(path.join(options.themes, themes[count], 'dist'), dest, {mkdirp: true}, function() {
                buildNextTheme();
            });
        };

        buildNextTheme();
    });
};
