/**
 * Logging wrapper that helps simplify/unify several task types. Also
 * adds some formatted printing and more color coding, because you can
 * never have enough color coding.
 */
var module_name = 'Logger';
var module_version = '2.0.1';

// Node.js modules
require('colors');
var _ = require('underscore');
var spyglass = require('spyglass');
var fs = require('fs');

// Styles for messages
var default_styles = {
	'modname'	: ['green'],
	'version'	: ['cyan'],
	'init'		: ['grey'],
	'info'		: ['white', 'bold'],
	'warn'		: ['yellow'],
	'error'		: ['red', 'bold'],
	'debug'		: ['blue', 'bold'],
	'??????'	: ['rainbow']
};

// Options for logger
var default_options = {
	'styles'		: default_styles,
	'console'		: true,
	'file'			: true,
	'path'			: './default.log',
	'spyglass'		: {
		'stream': null,
		'skip'	: ['stack'],
		'hide'	: {'types' : ['null', 'undefined']}
	},
	'versionSize'	: 6,
	'modNameSize'	: 12,
	'typeSize'		: 8
};

/**
 * Constructor for the logger. This is only called internally, everyone else calls configure
 * @param options Object of options for the logger
 */
function Logger(options) {
	this.configure(options);
}

/**
 * Member variables. The logger is a singleton though, so it doesn't really matter where these are
 */
_.extend(Logger.prototype, {
	gls : null,				//!< Spyglass instance, this will be (re)set during configure() calls
	anonCount : 0,			//!< Count of anonymous variables printed via var_dump()
	options : {},			//!< Options passed in to configure
	RIGHT : 0,				//!< Alignment constant, make text right aligned in a fixed-width field
	CENTER : 1,				//!< Alignment constant, make text centered
	LEFT : 2,				//!< Aignment constant, make text left aligned
	outfile : null,			//!< Stream to write output log file
	unknown : '(unknown)',	//!< Unknown source module substitute name

	/**
	 * Merges together two or more options objects in a property-aware way
	 * @param arguments, any number of objects
	 * @return Object merged options from the left
	 */
	merge : function() {
		var rtn = {'styles' : {}};
		_.each(Array.prototype.slice.call(arguments), function(v) {
			_.extend(rtn, _.omit(v, 'styles'));
			_.extend(rtn.styles, v.styles);
		});
		return rtn;
	},

	/**
	 * Configures the logger with a set of options as given, useful for reconfiguring the module
	 * @param options The key/value pairs of options to configure
	 */
	configure : function(options) {
		this.options = this.merge(this.options, options);
		this.gls = new spyglass(this.options.spyglass);
		this.unknown = this.pad('(unknown)', this.options.modNameSize, this.CENTER);
		
		if (this.outfile) {
			this.outfile.end();
			this.outfile = null;
		}

		if (this.options.file)
			this.outfile = fs.createWriteStream(this.options.path);
	},

	/**
	 * Stylize a string using the list of options
	 * @param str The string to stylize
	 * @param fmt The format to use for styling
	 * @return String the string with formatting applied courtesy of colors
	 */
	s : function(str, fmt) {
		var styles = this.options.styles[fmt];
		return _.reduce(styles, function(memo, v) {
			return memo[v];
		}, str);
	},

	/**
	 * Pad a string to a certain size with spaces, using additional alignment information
	 * @param str The string to pad
	 * @param size The number of characters to have in total
	 * @param align The alignment constant
	 * @return String the padded and aligned string
	 */
	pad : function(str, size, align) {
		if (align === undefined)
			align = this.LEFT;

		if (str.length >= size)
			return str.substring(0, size);

		var padding = new Array(size-str.length).join(' ');

		switch(align) {
			case this.LEFT:
				return str + padding;
			case this.RIGHT:
				return padding + str;
			case this.CENTER:
				var offset = Math.floor(padding.length/2);
				return padding.substring(0, offset) + str + padding.substring(offset, padding.length);
		}
	},

	/**
	 * Module init message function, color codes nicely and then prints to the console information about
	 * the module that just initialized.
	 * @param name The name of the module being initialized
	 * @param version The version string to display
	 * @param msg Startup message from the module
	 */
	module_init : function(name, version, msg) {
		var msgText = msg || 'Startup';
		var versionText = '[ ' + this.pad('v'+version, this.options.versionSize, this.RIGHT) + ' ]';

		this.log('init', name, this.s(versionText, 'version') + ' ' + msgText);
	},

	/**
	 * Easy function used to format messages by type, color the module name, etc., and then print to the
	 * stdout.
	 * @param type The type of message to print
	 * @param src The source of the message
	 * @param msg The messae itself
	 * @todo Strip colors from outfile
	 */
	log : function(type, src, msg) {
		var typestr = this.s('[ ' + this.pad('-' + type + '-', this.options.typeSize) + ' ]', type);
		var modname = this.s('[ ' + this.pad(src, this.options.modNameSize) + ' ]', 'modname');
		var output = typestr + ' ' + modname + ' ' + msg;
		
		if (this.options.console)
			console.log(output);

		if (this.options.file)
			this.outfile.write(output.stripColors + '\n', 'utf8');
	},

	/**
	 * Wrapper for spyglass to make it play with the rest of our formatting
	 * @param obj The object to inspect
	 * @param options The options for inspection, plus 'name' the name of the object, and 'src,' the source module. Optional
	 */
	var_dump : function(obj, options) {
		options = options || {};
		if (typeof options == 'string' || options instanceof String)
			options = {name : options};

		var src = options.src || this.unknown;
		var name = options.name || (this.anonCount += 1, '<' + this.anonCount + '>');

		this.debug(this.gls.inspect(obj, 'var_dump(' + name + ')', _.omit(options, ['src', 'name'])), src);
	},
	
	/**
	 * Convenience functions to call log() with various message types
	 * @param msg The message
	 * @param src The source of the message
	 */
	info : function(msg, src) {
		src = src || this.unknown;
		this.log('info', src, msg);
	},
	warn : function(msg, src) {
		src = src || this.unknown;
		this.log('warn', src, msg);
	},
	error : function(msg, src) {
		src = src || this.unknown;
		this.log('error', src, msg);
	},
	debug : function(msg, src) {
		src = src || this.unknown;
		this.log('debug', src, msg);
	}

});

// Export a singleton instance of the logger
module.exports = new Logger(default_options);

// Show off init function on load :D
module.exports.module_init(module_name, module_version);
