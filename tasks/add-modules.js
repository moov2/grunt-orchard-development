/*
 * Adds modules to an Orchard solution.
 */

var fs = require('fs');
var path = require('path');
var mv = require('mv');
var xml2js = require('xml2js')
var _s = require('underscore.string');

'use strict';

module.exports = function(grunt) {

    var SOLUTION_DIRECTORY_MODULES = 'E9C9F120-07BA-4DFB-B9C3-3AFB9D44C9D5',
        SOLUTION_DIRECTORY_CONTAINER = 'src',
        SOLUTION_FILE_NAME = 'Orchard.sln',
        DEFAULT_DIRECTORY_MODULES = './modules';

    var helpers = {
        /**
         * Returns directories inside the directory associated to the provided path.
         */
        getDirectories: function (srcpath) {
            return fs.readdirSync(srcpath).filter(function(file) {
                return fs.statSync(path.join(srcpath, file)).isDirectory();
            });
        },

        /**
         * Extracts the project GUID from the provided .csproj file.
         */
        getProjectGuid: function (csprojFilePath, success) {
            var parser = new xml2js.Parser(),
                projectGuid;

            fs.readFile(csprojFilePath, function(err, data) {
                parser.parseString(data, function (err, result) {
                    projectGuid = JSON.stringify(result.Project.PropertyGroup[0].ProjectGuid[0].toString());
                    projectGuid = projectGuid.replace(/"/g, '');
                    success(projectGuid);
                });
            });
        }
    };

    grunt.registerTask('addModulesToOrchard', 'Adds modules to the Orchard solution file.', function () {
        /**
         * Retrieves defined options.
         */
        var options = this.options();
        grunt.verbose.writeflags(options, 'Options');

        options.modules = options.modules || DEFAULT_DIRECTORY_MODULES;

        // grunt task should be marked as async.
        var done = this.async(),
            modules = helpers.getDirectories(options.modules),
            solutionFile = path.join(options.orchard, SOLUTION_DIRECTORY_CONTAINER, SOLUTION_FILE_NAME),
            count = -1,
            solutionFileContents,
            isDirty = false;

        // grunt task must specify the location of Orchard.
        if (!options.orchard) {
            grunt.fail.fatal('Must specify `orchard`.');
        }

        /**
         * Writes the update contents of the solution to file.
         */
        var writeSolutionFileContents = function () {
            fs.writeFile(solutionFile, solutionFileContents, function(err) {
                if (err) {
                    grunt.fail.warning('Failed to update solution file.');
                }

                done();
            });
        };

        /**
         * Returns flag indicating whether the project already exists within the
         * the solution.
         */
        var alreadyInSolution = function (projectGuid) {
            return solutionFileContents.indexOf(projectGuid) >= 0;
        };

        /**
         * Add the next module to Orchard solution.
         */
        var addNextModule = function () {
            count++;

            // all modules have been added have been added.
            if (count === modules.length) {
                // check if solution file content needs to be updated.
                if (isDirty) {
                    writeSolutionFileContents();
                    return;
                }

                // slight delay to ensure future tasks can interact with module files.
                setTimeout(done, 500);
                return;
            }

            var moduleName = modules[count];

            // ignore directory when module doesn't contain .csproj file.
            if (!fs.existsSync(path.join(options.modules, moduleName, moduleName + '.csproj'))) {
                addNextModule();
                return;
            }

            helpers.getProjectGuid(path.join(options.modules, moduleName, moduleName + '.csproj'), function (moduleGuid) {
                // module already exists in the solution, move onto the next one.
                if (alreadyInSolution(moduleGuid)) {
                    addNextModule();
                    return;
                }

                var projectReference = '\r\nProject("{FAE04EC0-301F-11D3-BF4B-00C04F79EFBC}") = "' + moduleName + '", "Orchard.Web\\Modules\\' + moduleName + '\\' + moduleName + '.csproj", "' + moduleGuid + '"\r\nEndProject\r\n';
                var projectConfiguationPlatforms = '\t\t' + moduleGuid + '.Debug|Any CPU.ActiveCfg = Debug|Any CPU\r\n\t\t' + moduleGuid + '.Debug|Any CPU.Build.0 = Debug|Any CPU\r\n\t\t' + moduleGuid + '.Release|Any CPU.ActiveCfg = Release|Any CPU\r\n\t\t' + moduleGuid + '.Release|Any CPU.Build.0 = Release|Any CPU\r\n';

                solutionFileContents = _s.insert(solutionFileContents, solutionFileContents.lastIndexOf('EndProject') + 10, projectReference)

                var sectionStart = solutionFileContents.indexOf("GlobalSection(ProjectConfigurationPlatforms)");
                var sectionEnd = sectionStart + solutionFileContents.substring(sectionStart).indexOf('EndGlobalSection');

                solutionFileContents = _s.insert(solutionFileContents, sectionEnd, projectConfiguationPlatforms);

                sectionStart = solutionFileContents.indexOf("GlobalSection(NestedProjects)");
                sectionEnd = sectionStart + solutionFileContents.substring(sectionStart).indexOf('EndGlobalSection');
                solutionFileContents = _s.insert(solutionFileContents, sectionEnd, '\t' + moduleGuid + ' = {' + SOLUTION_DIRECTORY_MODULES + '}\r\n\t');

                isDirty = true;

                addNextModule();
            });
        };

        /**
         * Reads the solution file and stores the contents in a variable.
         */
        var readSolutionFile = function () {
            fs.readFile(solutionFile, function(err, data) {
                solutionFileContents = data.toString();

                // start adding modules to the solution.
                addNextModule();
            });
        };

        readSolutionFile();
    });
};
