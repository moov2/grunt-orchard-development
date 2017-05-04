/**
 * Allows you to remove stock orchard modules
 */

var fs = require('fs');
var path = require('path');
var xml2js = require('xml2js')

'use strict'

module.exports = function (grunt) {

    var SOLUTION_DIRECTORY_MODULES = 'E9C9F120-07BA-4DFB-B9C3-3AFB9D44C9D5',
        SOLUTION_DIRECTORY_CONTAINER = 'src',
        SOLUTION_FILE_NAME = 'Orchard.sln',
        SOLUTION_MODULES_DIRECTORY = SOLUTION_DIRECTORY_CONTAINER + '/Orchard.Web/Modules',
        DEFAULT_MODULES = [];

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
        getProjectGuid: function (csprojFilePath, success, error) {
            var parser = new xml2js.Parser(),
                projectGuid;

            fs.readFile(csprojFilePath, function(err, data) {
                if (typeof(data) !== 'undefined') {
                    parser.parseString(data, function (err, result) {
                        if (typeof(result) !== 'undefined') {
                            projectGuid = JSON.stringify(result.Project.PropertyGroup[0].ProjectGuid[0].toString());
                            projectGuid = projectGuid.replace(/"/g, '');
                            success(projectGuid);
                        } else {
                            error(err);
                        }
                    });
                } else {
                    error(err);
                }
            });
        }

    };

    grunt.registerTask('removeModulesFromOrchard', 'Removes specified modules from the local Orchard install.', function () {
        /**
         * Retrieves defined options.
         */
        var options = this.options();
        grunt.verbose.writeflags(options, 'Options');

        // grunt task must specify the location of Orchard.
        if (!options.orchard) {
            grunt.fail.fatal('Must specify `orchard`.');
        }

        options.modules = options.modules || DEFAULT_MODULES;

        // grunt task should be marked as async.
        var done = this.async(),
            allModules = helpers.getDirectories(path.join(options.orchard, SOLUTION_MODULES_DIRECTORY)),
            removeModules = options.modules,
            solutionFile = path.join(options.orchard, SOLUTION_DIRECTORY_CONTAINER, SOLUTION_FILE_NAME),
            count = -1,
            solutionFileContents,
            isDirty = false;

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
        var alreadyNotInSolution = function (projectGuid) {
            return solutionFileContents.indexOf(projectGuid) < 0;
        };

        /**
         * Add the next module to Orchard solution.
         */
        var removeNextModule = function () {
            count++;

            // all modules have been removed.
            if (count === removeModules.length) {
                // check if solution file content needs to be updated.
                if (isDirty) {
                    writeSolutionFileContents();
                    return;
                }

                // slight delay to ensure future tasks can interact with module files.
                setTimeout(done, 500);
                return;
            }

            var moduleName = removeModules[count],
                moduleDir =  path.join(options.orchard, SOLUTION_MODULES_DIRECTORY, moduleName),
                moduleProject = path.join(moduleDir, moduleName + '.csproj'),
                moduleGuid;

            helpers.getProjectGuid(moduleProject, function (moduleGuid) {
               if (grunt.file.exists(moduleDir)) {
                    grunt.file.delete(moduleDir);
                }

                // module already exists in the solution, move onto the next one.
                if (alreadyNotInSolution(moduleGuid)) {
                    removeNextModule();
                    return;
                }

                var escapedModuleName = moduleName.replace('.','\\.');
                var escapedModuleGuid = moduleGuid.replace('{','{\\s*').replace('}','\\s*}');

                /**
                 * Cleans any project reference elements
                 */
                var projectReferencePatternString = '(Project\\(\\"\\s*{\\s*FAE04EC0-301F-11D3-BF4B-00C04F79EFBC\\s*}\\s*\\"\\)\\s*=\\s*\\"' + escapedModuleName + '",\\s*\\"Orchard\\.Web\\\\Modules\\\\' + escapedModuleName + '\\\\' + escapedModuleName + '\\.csproj\\",\\s*\\"\\s*' + escapedModuleGuid + '\\s*\\"\\s*EndProject\\s*)';

                /**
                 * Cleans any post project project section elements
                 */
                var postProjectProjectSectionPattern = '('+escapedModuleGuid+'\\s*=\\s*\\{[A-Fa-f0-9\\-]*\\}\\s*)';

                /**
                 * Cleans any project configuration platforms elements
                 */
                var projectConfigurationPlatformsPattern = '(' + escapedModuleGuid + '\\.\\w*\\s*\\|{1,10}.*Any CPU\\s*)';


                /**
                 * Create and apply regex to clear out matching content
                 */
                solutionFileContents = solutionFileContents.replace(new RegExp(projectReferencePatternString, 'g'), '');
                solutionFileContents = solutionFileContents.replace(new RegExp(postProjectProjectSectionPattern, 'g'), '');
                solutionFileContents = solutionFileContents.replace(new RegExp(projectConfigurationPlatformsPattern, 'g'), '');


                isDirty = true;

                removeNextModule();
            }, function (err) {
                if (grunt.file.exists(moduleDir)) {
                    grunt.file.delete(moduleDir);
                }

                removeNextModule();
           });
        };

        /**
         * Reads the solution file and stores the contents in a variable.
         */
        var readSolutionFile = function () {
            fs.readFile(solutionFile, function(err, data) {
                solutionFileContents = data.toString();

                // start adding modules to the solution.
                removeNextModule();
            });
        };

        readSolutionFile();
    });
};
