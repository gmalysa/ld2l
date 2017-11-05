/**
 * Grunt file to run common things like rebuilding the GUI files if need be.
 * Consider adding auto-build to startup.
 */

var _ = require('underscore');
var exec = require('child_process').exec;
var fs = require('fs');

module.exports = function(grunt) {
	var clientdir = './client';
	var staticdir = './static';

	grunt.registerTask('default', 'Options listing', function() {
		grunt.log.writeln('Available tasks are:');
		grunt.log.writeln('  js - minify client js and update static folder');
		grunt.log.writeln('  css - compile less css into static folder');
		grunt.log.writeln('  test - TODO - run unit tests and show results');
	});

	grunt.registerTask('js', 'Minify client javascript and update the static folder with new versions', function() {
		files = fs.readdirSync(clientdir+'/javascript');
		_.each(files, function(v, k) {
			if (v[0] == '.')
				return;
			grunt.log.writeln('Uglifying javascript '+v);
			exec('uglifyjs -m -c -r "$,_" '+clientdir+'/javascript/'+v+' -o '+staticdir+'/javascript/'+v);
		});
	});

	grunt.registerTask('css', 'Compile LESS css scripts and update static folder', function() {
		files = fs.readdirSync(clientdir+'/css');
		_.each(files, function(v, k) {
			if (v[0] == '.')
				return;
			grunt.log.writeln('Compiling LESS file '+v);
			exec('lessc -x '+clientdir+'/css/'+v+' > '+staticdir+'/css/'+v);
		});
	});
}
